// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SiriTrip",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "SiriTrip",
            path: "Sources/SiriTrip",
            resources: [.process("Resources")]
        )
    ]
)
