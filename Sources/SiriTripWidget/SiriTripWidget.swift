import SwiftUI
import WidgetKit

struct SiriTripEntry: TimelineEntry {
    let date: Date
}

struct SiriTripProvider: TimelineProvider {
    func placeholder(in context: Context) -> SiriTripEntry {
        SiriTripEntry(date: .now)
    }

    func getSnapshot(in context: Context, completion: @escaping (SiriTripEntry) -> Void) {
        completion(SiriTripEntry(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SiriTripEntry>) -> Void) {
        completion(Timeline(entries: [SiriTripEntry(date: .now)], policy: .never))
    }
}

struct SiriTripWidgetView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "waveform")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .background(
                        LinearGradient(
                            colors: [.cyan, .blue, .purple],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        in: Circle()
                    )
                    .accessibilityHidden(true)
                if family == .systemMedium {
                    Text("Siri Trip")
                        .font(.system(size: 23, weight: .bold))
                }
                Spacer(minLength: 0)
            }

            if family == .systemSmall {
                Text("Siri Trip")
                    .font(.system(size: 20, weight: .bold))
            } else {
                Text("Plan a trip. Pick up where you left off.")
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.8))
            }

            Spacer(minLength: 0)
            Label("Tap to open", systemImage: "arrow.up.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.cyan)
        }
        .foregroundStyle(.white)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(red: 0.09, green: 0.16, blue: 0.29), Color(red: 0.02, green: 0.04, blue: 0.08)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        .widgetURL(URL(string: "siritrip://open"))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Open Siri Trip")
        .accessibilityIdentifier("siriTripWidget")
    }
}

@main
struct SiriTripWidget: Widget {
    let kind = "SiriTripWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SiriTripProvider()) { _ in
            SiriTripWidgetView()
        }
        .configurationDisplayName("Siri Trip")
        .description("Open Siri Trip from Today View or your Home Screen.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
