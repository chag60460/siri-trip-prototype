import SwiftUI

struct PlanCard: View {
    var onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Chicago").font(.system(size: 20, weight: .bold))
                Spacer()
                Text("Jul 1 - 7").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.teal)
            }
            .foregroundStyle(.white)

            Divider().overlay(Color.white.opacity(0.14))

            row("airplane.departure", "United 482", "$118")
            row("bed.double.fill", "The Loop Hotel", "$142/nt")
            row("ticket.fill", "Boat tour + 5 more", "$96")

            Divider().overlay(Color.white.opacity(0.14))

            HStack {
                Text("Total $472").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                Spacer()
                Text("under your $500 budget").font(.system(size: 13)).foregroundStyle(Theme.textSecondary)
            }

            Button(action: onOpen) {
                Text("Open plan")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
                    .background(Capsule().fill(Theme.bubbleOut))
            }
            .buttonStyle(.plain)
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.ultraThinMaterial)
                .environment(\.colorScheme, .dark)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(Color.white.opacity(0.18))
        )
    }

    private func row(_ icon: String, _ label: String, _ value: String) -> some View {
        HStack(spacing: 11) {
            Image(systemName: icon).font(.system(size: 15)).foregroundStyle(Theme.optionBlue).frame(width: 20)
            Text(label).font(.system(size: 15)).foregroundStyle(Theme.textOnCard)
            Spacer()
            Text(value).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.textSecondary)
        }
    }
}

/// July 2026 starts on a Wednesday; 1-7 is preselected as a connected range.
struct CalendarPicker: View {
    var onConfirm: () -> Void
    @State private var range: ClosedRange<Int> = 1...7

    private let leadingBlanks = 3
    private let days = 31

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text("July 2026").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
                Spacer()
                Image(systemName: "chevron.left")
                Image(systemName: "chevron.right")
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Theme.optionBlue)

            HStack(spacing: 0) {
                ForEach(Array(["S", "M", "T", "W", "T", "F", "S"].enumerated()), id: \.offset) { _, d in
                    Text(d).font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.textFaint)
                        .frame(width: 46, height: 24)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.fixed(46), spacing: 0), count: 7), spacing: 0) {
                ForEach(0..<(leadingBlanks + days), id: \.self) { slot in
                    if slot < leadingBlanks {
                        Color.clear.frame(height: 42)
                    } else {
                        let day = slot - leadingBlanks + 1
                        let selected = range.contains(day)
                        Text("\(day)")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(selected ? .white : Color(hex: 0xC3D6EE))
                            .frame(width: 46, height: 42)
                            .background {
                                if selected {
                                    UnevenRoundedRectangle(
                                        topLeadingRadius: isRangeStart(day) ? 21 : 0,
                                        bottomLeadingRadius: isRangeStart(day) ? 21 : 0,
                                        bottomTrailingRadius: isRangeEnd(day) ? 21 : 0,
                                        topTrailingRadius: isRangeEnd(day) ? 21 : 0
                                    )
                                    .fill(Theme.bubbleOut)
                                }
                            }
                    }
                }
            }

            Button(action: onConfirm) {
                Text("Jul 1 - Jul 7 selected")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.optionBlue)
                    .frame(maxWidth: .infinity)
                    .frame(height: 36)
                    .background(Capsule().fill(Theme.bubbleOut.opacity(0.18)))
                    .overlay(Capsule().strokeBorder(Theme.bubbleOut.opacity(0.45)))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(width: 386)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.ultraThinMaterial)
                .environment(\.colorScheme, .dark)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(Color.white.opacity(0.18))
        )
    }

    private func isRangeStart(_ day: Int) -> Bool {
        day == range.lowerBound || (day + leadingBlanks - 1) % 7 == 0
    }

    private func isRangeEnd(_ day: Int) -> Bool {
        day == range.upperBound || (day + leadingBlanks) % 7 == 0
    }
}

struct BookingOption: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
}

struct OptionsSheet: View {
    let title: String
    let options: [BookingOption]
    var showBookAll: Bool = false
    var onClose: () -> Void
    var onNext: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                Text(title).font(.system(size: 22, weight: .bold)).foregroundStyle(.white)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(hex: 0xC3D6EE))
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.white.opacity(0.12)))
                }
                .buttonStyle(.plain)
            }

            if showBookAll {
                Button(action: onNext) {
                    Text("Book all for me")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x06231D))
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .background(Capsule().fill(Theme.teal))
                }
                .buttonStyle(.plain)
            }

            HStack {
                Text("Pick one, or let Siri choose")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.textSecondary)
                Spacer()
                Text("Book for me")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.teal)
                    .padding(.horizontal, 12)
                    .frame(height: 30)
                    .background(Capsule().fill(Theme.teal.opacity(0.18)))
                    .overlay(Capsule().strokeBorder(Theme.teal.opacity(0.45)))
            }

            ForEach(options) { option in
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(option.title).font(.system(size: 16, weight: .semibold)).foregroundStyle(.white)
                        Text(option.detail).font(.system(size: 13)).foregroundStyle(Theme.textSecondary)
                    }
                    Spacer()
                    Button(action: onNext) {
                        Text("Book")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x06231D))
                            .frame(width: 74, height: 34)
                            .background(Capsule().fill(Theme.teal))
                    }
                    .buttonStyle(.plain)
                }
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .environment(\.colorScheme, .dark)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.16))
                )
            }

            Text("Redirects to the app or Safari")
                .font(.system(size: 13))
                .foregroundStyle(Theme.textFaint)

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.top, 56)
    }
}

struct ItineraryView: View {
    var onClose: () -> Void

    private let days: [(String, String)] = [
        ("7/1", "Fly ORD, check in near the Loop"),
        ("7/2", "Architecture boat tour, 2pm"),
        ("7/3", "Art Institute, deep dish at Lou's"),
        ("7/4", "Navy Pier fireworks"),
        ("7/5", "Millennium Park, Culver's run"),
        ("7/6", "Wicker Park, record shops"),
        ("7/7", "Brunch, fly home"),
    ]

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                Text("Suggested itinerary").font(.system(size: 22, weight: .bold)).foregroundStyle(.white)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(hex: 0xC3D6EE))
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.white.opacity(0.12)))
                }
                .buttonStyle(.plain)
            }

            ScrollView {
                VStack(spacing: 14) {
                    ForEach(Array(days.enumerated()), id: \.offset) { i, day in
                        HStack(alignment: .top, spacing: 14) {
                            Text(day.0)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Theme.teal)
                                .frame(width: 34, alignment: .leading)
                            Text(day.1).font(.system(size: 15)).foregroundStyle(Theme.textOnCard)
                            Spacer()
                        }
                        if i < days.count - 1 {
                            Divider().overlay(Color.white.opacity(0.10))
                        }
                    }
                }
                .padding(16)
            }
            .scrollIndicators(.visible)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .environment(\.colorScheme, .dark)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.16))
            )

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.top, 56)
    }
}
