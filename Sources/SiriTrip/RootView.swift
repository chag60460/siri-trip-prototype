import SwiftUI
import OSLog

struct ConversationView: View {
    @ObservedObject var engine: ConversationEngine
    var isActive: Bool
    @State private var voiceMode = false

    var body: some View {
        VStack(spacing: 0) {
            StatusBar()
            NavBar { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { voiceMode.toggle() } }
                .overlay(alignment: .bottom) { Divider().overlay(Color.white.opacity(0.10)) }

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 12) {
                        Spacer(minLength: 12)
                        ForEach(engine.items) { item in
                            row(for: item).id(item.id)
                        }
                        if engine.planReady {
                            PlanCard { engine.route = .flights }
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                                .id("plan")
                        }
                        Spacer(minLength: 8)
                    }
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollIndicators(.hidden)
                .onChange(of: engine.items.count) { _, _ in
                    withAnimation { proxy.scrollTo(engine.items.last?.id, anchor: .bottom) }
                }
                .onChange(of: engine.planReady) { _, ready in
                    if ready { withAnimation { proxy.scrollTo("plan", anchor: .bottom) } }
                }
            }

            if voiceMode {
                VoiceBar(
                    onKeyboard: { withAnimation { voiceMode = false } },
                    onClose: { withAnimation { voiceMode = false } }
                )
                .padding(.horizontal, 10)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                InputBar(
                    onMic: { withAnimation { voiceMode = true } },
                    onSend: engine.send,
                    isSending: engine.isResponding,
                    isActive: isActive
                )
            }
        }
    }

    @ViewBuilder
    private func row(for item: ChatItem) -> some View {
        switch item {
        case .incoming(_, let text, let options):
            ChatBubble(text: text, isOutgoing: false, options: options) { engine.choose($0) }
        case .outgoing(_, let text):
            ChatBubble(text: text, isOutgoing: true)
        case .fact(_, let text):
            FactBubble(text: text)
        case .typing:
            TypingIndicator()
        }
    }
}

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var engine = ConversationEngine()
    @State private var conversationStarted = false

    private static let logger = Logger(subsystem: "com.gracechang.SiriTrip", category: "AppLinks")

    var body: some View {
        PhoneFrame {
            VStack(spacing: 0) {
                content
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                HomeBar()
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("siriScreen")
        }
        .onAppear(perform: startConversationIfNeeded)
        .onOpenURL(perform: openAppLink)
        #if os(macOS)
        .padding(40)
        #endif
    }

    private func startConversationIfNeeded() {
        guard !conversationStarted else { return }
        conversationStarted = true
        engine.start()
    }

    private func openAppLink(_ url: URL) {
        guard url.scheme?.lowercased() == "siritrip",
              url.host?.lowercased() == "open",
              url.path.isEmpty || url.path == "/" else {
            Self.logger.error("Unsupported app link: \(url.absoluteString, privacy: .private)")
            return
        }
        startConversationIfNeeded()
    }

    @ViewBuilder
    private var content: some View {
        switch engine.route {
        case .conversation:
            ConversationView(engine: engine, isActive: scenePhase == .active)

        case .calendar:
            VStack(spacing: 0) {
                StatusBar()
                NavBar()
                Spacer()
                CalendarPicker { engine.datesPicked() }
                Spacer()
                InputBar()
            }

        case .flights:
            OptionsSheet(
                title: "Flight options",
                options: [
                    .init(title: "United 482", detail: "8:05a - 9:35a · $118"),
                    .init(title: "Southwest 1190", detail: "11:20a - 12:50p · $132"),
                    .init(title: "Delta 704", detail: "4:45p - 6:15p · $145"),
                ],
                showBookAll: true,
                onClose: { engine.route = .conversation },
                onNext: { engine.route = .hotels }
            )
            .overlay(alignment: .top) { StatusBar() }

        case .hotels:
            OptionsSheet(
                title: "Hotel options",
                options: [
                    .init(title: "The Loop Hotel", detail: "0.3 mi to river · $142/night"),
                    .init(title: "River North Suites", detail: "0.6 mi to Pier · $128/night"),
                    .init(title: "Printer's Row Inn", detail: "0.9 mi to Loop · $111/night"),
                ],
                onClose: { engine.route = .conversation },
                onNext: { engine.route = .itinerary }
            )
            .overlay(alignment: .top) { StatusBar() }

        case .itinerary:
            ItineraryView { engine.route = .conversation }
                .overlay(alignment: .top) { StatusBar() }
        }
    }
}
