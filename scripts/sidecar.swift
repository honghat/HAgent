#!/usr/bin/env swift

import Foundation

// Get the Sidecar device UUID from preferences
func getRecentDeviceUUID() -> String? {
    let task = Process()
    task.launchPath = "/usr/bin/defaults"
    task.arguments = ["read", "com.apple.sidecar.display", "recents"]
    
    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = Pipe()
    task.launch()
    
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    task.waitUntilExit()
    
    guard task.terminationStatus == 0,
          let output = String(data: data, encoding: .utf8) else {
        return nil
    }
    
    // Parse: (\n    "8B8A2C13-8679-4D68-97B1-BEA31AC638B0"\n)
    let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "(", with: "")
        .replacingOccurrences(of: ")", with: "")
        .replacingOccurrences(of: "\n", with: "")
        .replacingOccurrences(of: " ", with: "")
        .replacingOccurrences(of: "\"", with: "")
    
    let components = trimmed.split(separator: ",")
    for comp in components {
        let uuid = String(comp).trimmingCharacters(in: .whitespacesAndNewlines)
        if uuid.count == 36 {
            return uuid
        }
    }
    
    return nil
}

func isSidecarConnected() -> Bool {
    let task = Process()
    task.launchPath = "/usr/sbin/system_profiler"
    task.arguments = ["SPDisplaysDataType"]
    
    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = Pipe()
    task.launch()
    
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    task.waitUntilExit()
    
    if let output = String(data: data, encoding: .utf8) {
        return output.contains("Sidecar Display")
    }
    return false
}

// Method 1: Post Darwin notification (triggers SidecarRelay to connect)
func postNotification() {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    CFNotificationCenterPostNotification(center, CFNotificationName("com.apple.sidecar.connect" as CFString), nil, nil, false)
    print("  Posted: com.apple.sidecar.connect")
}

// Method 2: Tell SidecarRelay to discover and connect
func triggerRelay() {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    CFNotificationCenterPostNotification(center, CFNotificationName("com.apple.sidecar-relay.connect" as CFString), nil, nil, false)
    CFNotificationCenterPostNotification(center, CFNotificationName("com.apple.sidecar-display-connect" as CFString), nil, nil, false)
    print("  Posted: relay notifications")
    
    // Also try posting with device-specific notification
    if let uuid = getRecentDeviceUUID() {
        let name = "com.apple.sidecar.connect.\(uuid)" as CFString
        CFNotificationCenterPostNotification(center, CFNotificationName(name), nil, nil, false)
        print("  Posted: \(name)")
    }
}

// Wait for network/IPad to be available
func waitForNetwork() {
    print("  Waiting for network...", terminator: "")
    for _ in 0..<30 {
        let task = Process()
        task.launchPath = "/sbin/ping"
        task.arguments = ["-c1", "-t1", "100.69.50.64"]
        task.standardOutput = Pipe()
        task.standardError = Pipe()
        task.launch()
        task.waitUntilExit()
        if task.terminationStatus == 0 {
            print(" OK")
            return
        }
        print(".", terminator: "")
        Thread.sleep(forTimeInterval: 2)
    }
    print(" timeout")
}

// Main
print("🖥️  Sidecar Auto-Connect")
print("  Checking current status...")

if isSidecarConnected() {
    print("  ✅ Sidecar already connected!")
    exit(0)
}

guard let uuid = getRecentDeviceUUID() else {
    print("  ❌ No recent Sidecar device found")
    print("  Please connect your iPad via Sidecar manually once first.")
    exit(1)
}
print("  Target device: \(uuid)")

// Try to connect
print("  Attempting connection...")
postNotification()
triggerRelay()

// Wait and verify
for i in 1...6 {
    Thread.sleep(forTimeInterval: 2)
    if isSidecarConnected() {
        print("  ✅ Sidecar connected successfully!")
        exit(0)
    }
    print("  Attempt \(i): not connected yet...")
    if i == 3 {
        postNotification()
        triggerRelay()
    }
}

print("  ⚠️  Could not verify Sidecar connection")
print("  (iPad may need to be awake and on same network)")
