import SwiftUI

struct StatusBar: View {
    var body: some View {
        #if os(macOS)
        HStack {
            Text("9:41").font(.system(size: 15, weight: .semibold))
            Spacer()
            HStack(spacing: 5) {
                Image(systemName: "cellularbars")
                Image(systemName: "wifi")
                Image(systemName: "battery.100")
            }
            .font(.system(size: 14))
        }
        .foregroundStyle(.white)
        .padding(.leading, 32)
        .padding(.trailing, 26)
        .frame(height: 50)
        #else
        EmptyView()
        #endif
    }
}

struct NavBar: View {
    var title: String = "Siri"
    var subtitle: String = "Always on"
    var onVoice: () -> Void = {}

    var body: some View {
        HStack(spacing: 11) {
            SiriOrb(size: 36)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 17, weight: .semibold))
                Text(subtitle).font(.system(size: 12)).foregroundStyle(Theme.textMuted)
            }
            .foregroundStyle(.white)
            Spacer()
            Button(action: onVoice) {
                Image(systemName: "waveform")
                    .font(.system(size: 18))
                    .foregroundStyle(Theme.optionBlue)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white.opacity(0.12)))
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.18)))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .frame(height: 58)
    }
}

struct InputBar: View {
    var placeholder: String = "Ask Siri"
    var onPlus: () -> Void = {}
    var onMic: () -> Void = {}
    var onSend: ((String) -> Void)? = nil
    var isSending = false
    var isActive = true
    @State private var draft = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onPlus) {
                Image(systemName: "plus")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Theme.optionBlue)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(Color.white.opacity(0.12)))
                    .overlay(Circle().strokeBorder(Color.white.opacity(0.18)))
            }
            .buttonStyle(.plain)

            HStack {
                TextField(placeholder, text: $draft)
                    .focused($isFocused)
                    .textFieldStyle(.plain)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.textPrimary)
                    .tint(Theme.accent)
                    .submitLabel(.send)
                    .onSubmit(send)
                    .disabled(onSend == nil || isSending)
                    .accessibilityIdentifier("messageField")

                if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button(action: onMic) {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(Theme.optionBlue)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Voice chat")
                } else {
                    Button(action: send) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(Theme.accent)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(isSending || onSend == nil)
                    .accessibilityLabel("Send message")
                    .accessibilityIdentifier("sendMessage")
                }
            }
            .padding(.leading, 16)
            .padding(.trailing, 12)
            .frame(height: 44)
            .background(Capsule().fill(Color.white.opacity(0.10)))
            .overlay(
                Capsule().strokeBorder(Color.white.opacity(0.20))
                    .allowsHitTesting(false)
            )
        }
        .padding(.horizontal, 14)
        .frame(height: 54)
        .onChange(of: isActive) { _, active in
            if !active { isFocused = false }
        }
    }

    private func send() {
        let message = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !isSending, let onSend else { return }
        onSend(message)
        draft = ""
    }
}

struct HomeBar: View {
    var body: some View {
        #if os(macOS)
        Capsule()
            .fill(Color.white)
            .frame(width: 140, height: 5)
            .frame(height: 30)
        #else
        EmptyView()
        #endif
    }
}

/// Expanded voice state carried over from the Hybrid concept.
struct VoiceBar: View {
    var onKeyboard: () -> Void = {}
    var onClose: () -> Void = {}
    @State private var animate = false

    private let heights: [CGFloat] = [8, 16, 26, 34, 22, 30, 14, 20, 32, 24, 12, 18, 28, 10, 16]

    var body: some View {
        VStack(spacing: 12) {
            Text("Listening…")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.textMuted)

            HStack(spacing: 4) {
                ForEach(Array(heights.enumerated()), id: \.offset) { i, h in
                    Capsule()
                        .fill(Color(hex: 0x4DA3FF))
                        .frame(width: 3, height: animate ? h : h * 0.4)
                        .animation(
                            .easeInOut(duration: 0.5)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.05),
                            value: animate
                        )
                }
            }
            .frame(height: 36)

            HStack(spacing: 26) {
                Button(action: onKeyboard) {
                    Image(systemName: "keyboard").font(.system(size: 20)).foregroundStyle(Theme.textMuted)
                }
                .buttonStyle(.plain)

                Circle()
                    .fill(LinearGradient(
                        colors: [Color(hex: 0x3FA9FF), Color(hex: 0x0A6FFF)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
                    .frame(width: 64, height: 64)
                    .overlay(Image(systemName: "mic.fill").font(.system(size: 24)).foregroundStyle(.white))

                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 18)).foregroundStyle(Theme.textMuted)
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 6)
        }
        .padding(.top, 20)
        .padding(.bottom, 14)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .fill(Color(hex: 0x080E1A, alpha: 0.74))
        )
        .onAppear { animate = true }
    }
}
