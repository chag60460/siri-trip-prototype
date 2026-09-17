import SwiftUI

/// Palette ported from the Brilliant deck.
enum Theme {
    static let bubbleOut = Color(hex: 0x0A7CFF)
    static let bubbleIn = Color(hex: 0x2A3444)
    static let teal = Color(hex: 0x32D6B0)
    static let optionBlue = Color(hex: 0x7FC4FF)
    static let accent = Color(hex: 0x3FA9FF)

    static let textPrimary = Color.white
    static let textOnCard = Color(hex: 0xEAF2FF)
    static let textSecondary = Color(hex: 0x9DB2CE)
    static let textMuted = Color(hex: 0x8FA3C0)
    static let textFaint = Color(hex: 0x7189A8)

    static let screenW: CGFloat = 414
    static let screenH: CGFloat = 896
    static let screenRadius: CGFloat = 48
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

/// Navy gradient plus the two coloured glows the glass panels refract.
struct Backdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: 0x16294A), Color(hex: 0x0E1B30), Color(hex: 0x060B14)],
                startPoint: .topLeading,
                endPoint: .bottom
            )
            RadialGradient(
                colors: [Color(hex: 0x32D3E0, alpha: 0.18), .clear],
                center: UnitPoint(x: 0.84, y: 0.10),
                startRadius: 0,
                endRadius: 320
            )
            RadialGradient(
                colors: [Color(hex: 0x0A84FF, alpha: 0.40), .clear],
                center: UnitPoint(x: 0.5, y: 0.92),
                startRadius: 0,
                endRadius: 420
            )
        }
    }
}

/// Fixed-size device shell so the prototype reads at true iPhone dimensions.
struct PhoneFrame<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        #if os(macOS)
        ZStack {
            Backdrop()
            content
        }
        .frame(width: Theme.screenW, height: Theme.screenH)
        .clipShape(RoundedRectangle(cornerRadius: Theme.screenRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.screenRadius, style: .continuous)
                .strokeBorder(Color.white.opacity(0.10), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.5), radius: 40, y: 16)
        #else
        ZStack {
            Backdrop().ignoresSafeArea()
            content
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        #endif
    }
}
