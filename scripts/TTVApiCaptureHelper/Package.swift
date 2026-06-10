// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TTVApiCaptureHelper",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "TTVApiCaptureHelper", targets: ["TTVApiCaptureHelper"])
    ],
    targets: [
        .executableTarget(
            name: "TTVApiCaptureHelper"
        )
    ]
)
