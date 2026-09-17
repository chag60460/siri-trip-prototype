import SwiftUI

enum ChatItem: Identifiable, Equatable {
    case incoming(id: UUID, text: String, options: [String])
    case outgoing(id: UUID, text: String)
    case fact(id: UUID, text: String)
    case typing(id: UUID)

    var id: UUID {
        switch self {
        case .incoming(let id, _, _), .outgoing(let id, _), .fact(let id, _), .typing(let id): return id
        }
    }
}

/// Where the flow hands off to a dedicated screen instead of another bubble.
enum Route: Equatable {
    case conversation
    case calendar
    case flights
    case hotels
    case itinerary
}

@MainActor
final class ConversationEngine: ObservableObject {
    @Published private(set) var items: [ChatItem] = []
    @Published var route: Route = .conversation
    @Published private(set) var stage: String = "greeting"
    @Published var planReady = false

    /// Facts accumulate as the user answers, and feed the final plan card.
    @Published private(set) var facts: [String] = []

    @Published private(set) var isResponding = false

    func start() {
        items = []
        facts = []
        planReady = false
        stage = "greeting"
        say("Morning, Grace. What can I help you with?")
    }

    // MARK: - script

    func send(_ text: String) {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !isResponding, !message.isEmpty else { return }
        isResponding = true
        collapseOptions()
        append(.outgoing(id: UUID(), text: message))
        Task { await respond(to: message) }
    }

    func choose(_ option: String) {
        guard !isResponding else { return }
        isResponding = true
        // Echo the tap as the user's message, then strip the options from the prompt.
        collapseOptions()
        append(.outgoing(id: UUID(), text: option))
        Task { await respond(to: option) }
    }

    private func respond(to input: String) async {
        defer { isResponding = false }
        await pause()

        switch stage {
        case "greeting":
            stage = "askDates"
            say("Sure thing. Let me look into it.")
            await pause(0.5)
            ask("Do you have preferred dates?", ["Yes", "No"])

        case "askDates":
            if input == "Yes" {
                stage = "datesSet"
                route = .calendar
            } else {
                stage = "calPermission"
                ask("No problem. Let me check your calendar for a window. Allow Siri to access your Calendar?", ["Yes", "No"])
            }

        case "calPermission":
            if input == "Yes" {
                await think()
                stage = "proposeDates"
                ask("You're free 7/1 - 7/7. Use those as your dates?", ["Yes", "No"])
            } else {
                stage = "askBudget"
                say("I'll need calendar access for exact dates, so I'll plan a flexible week.")
                await pause(0.5)
                fact("Dates: flexible")
                await pause(0.4)
                askBudget()
            }

        case "proposeDates":
            stage = "askBudget"
            fact("Set dates 7/1 - 7/7")
            await pause(0.4)
            askBudget()

        case "datesSet":
            stage = "askBudget"
            fact("Set dates 7/1 - 7/7")
            await pause(0.4)
            askBudget()

        case "askBudget":
            if input == "Choose for me" {
                stage = "bankPermission"
                ask("No problem. Let me look at your bank account. Allow Siri to access your bank?", ["Yes", "No"])
            } else {
                stage = "activities"
                fact("Set budget as \(input)")
                await pause(0.4)
                ask("Preferred activities in mind?", ["Boat tour", "No"])
            }

        case "bankPermission":
            if input == "Yes" {
                await think()
                stage = "proposeBudget"
                ask("You usually spend under $500 on trips. Use that as the budget?", ["Yes", "No"])
            } else {
                stage = "activities"
                say("Since I can't access your bank, I'll plan without a budget.")
                await pause(0.5)
                ask("Preferred activities in mind?", ["Boat tour", "No"])
            }

        case "proposeBudget":
            stage = "activities"
            fact(input == "Yes" ? "Set budget as $500" : "No budget set")
            await pause(0.4)
            ask("Preferred activities in mind?", ["Boat tour", "No"])

        case "activities":
            stage = "food"
            if input == "No" {
                say("I'll pick a few that fit your dates and budget.")
                await pause(0.5)
                fact("Activities: Siri's picks")
            } else {
                fact("Activities: \(input)")
            }
            await pause(0.4)
            ask("Preferred food in mind?", ["Pizza, Culver's", "No"])

        case "food":
            stage = "lodging"
            if input == "No" {
                say("I'll find local favourites near your hotel.")
                await pause(0.5)
                fact("Food: Siri's picks")
            } else {
                fact("Food: \(input)")
            }
            await pause(0.4)
            ask("Preferred lodging in mind?", ["Near the Loop", "No"])

        case "lodging":
            stage = "generating"
            if input == "No" {
                say("I'll find something central and within budget.")
                await pause(0.5)
                fact("Lodging: Siri's picks")
            } else {
                fact("Lodging: \(input)")
            }
            await pause(0.5)
            await generate()

        default:
            break
        }
    }

    private func askBudget() {
        ask("What's your budget in mind?", ["$500", "Choose for me"])
    }

    private func generate() async {
        append(.typing(id: UUID()))
        try? await Task.sleep(for: .milliseconds(1600))
        removeTyping()
        stage = "done"
        say("Your Chicago plan is ready.")
        await pause(0.3)
        withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { planReady = true }
    }

    private func think() async {
        append(.typing(id: UUID()))
        try? await Task.sleep(for: .milliseconds(1200))
        removeTyping()
    }

    // MARK: - helpers

    private func say(_ text: String) {
        append(.incoming(id: UUID(), text: text, options: []))
    }

    private func ask(_ text: String, _ options: [String]) {
        append(.incoming(id: UUID(), text: text, options: options))
    }

    private func fact(_ text: String) {
        facts.append(text)
        append(.fact(id: UUID(), text: text))
    }

    private func append(_ item: ChatItem) {
        withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) {
            items.append(item)
        }
    }

    private func removeTyping() {
        withAnimation(.easeOut(duration: 0.2)) {
            items.removeAll { if case .typing = $0 { return true } else { return false } }
        }
    }

    /// Once a prompt is answered its options collapse, matching a real thread.
    private func collapseOptions() {
        guard let last = items.indices.last,
              case .incoming(let id, let text, let options) = items[last],
              !options.isEmpty else { return }
        items[last] = .incoming(id: id, text: text, options: [])
    }

    private func pause(_ seconds: Double = 0.65) async {
        try? await Task.sleep(for: .milliseconds(Int(seconds * 1000)))
    }

    func datesPicked() {
        route = .conversation
        send("Jul 1 - Jul 7")
    }
}
