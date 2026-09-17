import SwiftUI

@main
struct SiriTripApp: App {
    var body: some Scene {
        WindowGroup("Siri Trip Prototype") {
            RootView()
                .background(Color(hex: 0x111318))
                .preferredColorScheme(.dark)
        }
            #if os(macOS)
        .windowResizability(.contentSize)
            #endif
    }
}
