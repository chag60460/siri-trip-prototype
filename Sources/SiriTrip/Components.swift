import SwiftUI

struct SiriOrb: View {
    var size: CGFloat = 36
    var animated: Bool = false
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color(hex: 0x8FE3FF), Color(hex: 0x3FA9FF), Color(hex: 0x0A5BE0)],
                        center: UnitPoint(x: 0.34, y: 0.28),
                        startRadius: 0,
                        endRadius: size * 0.75
                    )
                )
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color(hex: 0xB65CFF, alpha: 0.85), .clear],
                        center: UnitPoint(x: 0.72, y: 0.78),
                        startRadius: 0,
                        endRadius: size * 0.6
                    )
                )
            Ellipse()
                .fill(Color.white.opacity(0.40))
                .frame(width: size * 0.30, height: size * 0.20)
                .offset(x: -size * 0.15, y: -size * 0.18)
        }
        .frame(width: size, height: size)
        .scaleEffect(pulse ? 1.06 : 1.0)
        .shadow(color: Color(hex: 0x3FA9FF, alpha: 0.5), radius: animated ? 24 : 8)
        .onAppear {
            guard animated else { return }
            withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }
}

/// Rounded bubble that reserves `tailWidth` on one side for an iMessage tail.
struct BubbleShape: Shape {
    var isOutgoing: Bool
    var radius: CGFloat = 20
    var tailWidth: CGFloat = 8

    func path(in rect: CGRect) -> Path {
        let body = CGRect(
            x: isOutgoing ? rect.minX : rect.minX + tailWidth,
            y: rect.minY,
            width: rect.width - tailWidth,
            height: rect.height
        )
        var path = Path(roundedRect: body, cornerRadius: radius, style: .continuous)
        let h = rect.maxY

        var tail = Path()
        if isOutgoing {
            let x = body.maxX
            tail.move(to: CGPoint(x: x - 8, y: h - 26))
            tail.addCurve(
                to: CGPoint(x: x + tailWidth, y: h),
                control1: CGPoint(x: x - 8, y: h - 8),
                control2: CGPoint(x: x - 2, y: h)
            )
            tail.addLine(to: CGPoint(x: x - 28, y: h))
        } else {
            let x = body.minX
            tail.move(to: CGPoint(x: x + 8, y: h - 26))
            tail.addCurve(
                to: CGPoint(x: x - tailWidth, y: h),
                control1: CGPoint(x: x + 8, y: h - 8),
                control2: CGPoint(x: x + 2, y: h)
            )
            tail.addLine(to: CGPoint(x: x + 28, y: h))
        }
        tail.closeSubpath()
        path.addPath(tail)
        return path
    }
}

struct ChatBubble: View {
    let text: String
    let isOutgoing: Bool
    var options: [String] = []
    var onOption: ((String) -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(text)
                .font(.system(size: 17))
                .foregroundStyle(isOutgoing ? Theme.textPrimary : Theme.textOnCard)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, options.isEmpty ? 0 : 12)

            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                Divider().overlay(Color.white.opacity(0.14))
                Button { onOption?(option) } label: {
                    Text(option)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.optionBlue)
                        .frame(maxWidth: .infinity)
                        .frame(height: 41)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 14)
        .padding(.leading, isOutgoing ? 16 : 24)
        .padding(.trailing, isOutgoing ? 24 : 16)
        .frame(maxWidth: 286, alignment: .leading)
        .background(BubbleShape(isOutgoing: isOutgoing).fill(isOutgoing ? Theme.bubbleOut : Theme.bubbleIn))
        .frame(maxWidth: .infinity, alignment: isOutgoing ? .trailing : .leading)
        .transition(.asymmetric(
            insertion: .scale(scale: 0.85, anchor: isOutgoing ? .bottomTrailing : .bottomLeading)
                .combined(with: .opacity),
            removal: .opacity
        ))
    }
}

/// Compact confirmation, e.g. "Set dates 7/1 - 7/7".
struct FactBubble: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Theme.textOnCard)
            .padding(.vertical, 12)
            .padding(.leading, 24)
            .padding(.trailing, 16)
            .background(BubbleShape(isOutgoing: false, radius: 18).fill(Theme.bubbleIn))
            .frame(maxWidth: .infinity, alignment: .leading)
            .transition(.scale(scale: 0.85, anchor: .bottomLeading).combined(with: .opacity))
    }
}

struct TypingIndicator: View {
    @State private var phase = 0

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color(hex: 0x8FA3C0))
                    .frame(width: 9, height: 9)
                    .opacity(phase == i ? 1.0 : 0.35)
            }
        }
        .padding(.vertical, 19)
        .padding(.leading, 28)
        .padding(.trailing, 20)
        .background(BubbleShape(isOutgoing: false).fill(Theme.bubbleIn))
        .frame(maxWidth: .infinity, alignment: .leading)
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(320))
                phase = (phase + 1) % 3
            }
        }
    }
}
