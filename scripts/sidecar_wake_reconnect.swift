import AppKit
import Foundation

final class Logger {
    private let url: URL
    private let queue = DispatchQueue(label: "sidecar.wake.logger")

    init(path: String) {
        self.url = URL(fileURLWithPath: path)
        if !FileManager.default.fileExists(atPath: path) {
            FileManager.default.createFile(atPath: path, contents: nil)
        }
    }

    func log(_ message: String) {
        let line = "[\(ISO8601DateFormatter().string(from: Date()))] \(message)\n"
        queue.async {
            guard let handle = try? FileHandle(forWritingTo: self.url) else { return }
            defer { try? handle.close() }
            try? handle.seekToEnd()
            if let data = line.data(using: .utf8) {
                try? handle.write(contentsOf: data)
            }
        }
        fputs(line, stdout)
    }
}

final class SidecarWakeDaemon {
    private let deviceName: String
    private let logger: Logger
    private var wakeObserver: NSObjectProtocol?

    init(deviceName: String, logPath: String) {
        self.deviceName = deviceName
        self.logger = Logger(path: logPath)
    }

    func start() {
        logger.log("Started daemon for device: \(deviceName)")

        wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            self?.scheduleReconnect(reason: "wake", delay: 8)
        }

        scheduleReconnect(reason: "startup", delay: 12)
    }

    private func scheduleReconnect(reason: String, delay: TimeInterval) {
        logger.log("Scheduling reconnect for \(reason) in \(Int(delay))s")
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.reconnect(reason: reason)
        }
    }

    private func reconnect(reason: String) {
        logger.log("Reconnect attempt started for \(reason)")

        let uiResult = runProcess(
            executable: "/usr/bin/osascript",
            arguments: ["-l", "AppleScript", "-e", sidecarAppleScript, deviceName]
        )

        if uiResult.status == 0 {
            logger.log("Reconnect succeeded via UI automation")
        } else {
            logger.log("Reconnect failed: \(uiResult.error.trimmingCharacters(in: .whitespacesAndNewlines))")
        }
    }

    private func runProcess(executable: String, arguments: [String]) -> (status: Int32, output: String, error: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments

        let outPipe = Pipe()
        let errPipe = Pipe()
        process.standardOutput = outPipe
        process.standardError = errPipe

        do {
            try process.run()
            process.waitUntilExit()

            let outData = outPipe.fileHandleForReading.readDataToEndOfFile()
            let errData = errPipe.fileHandleForReading.readDataToEndOfFile()

            let output = String(data: outData, encoding: .utf8) ?? ""
            let error = String(data: errData, encoding: .utf8) ?? ""
            return (process.terminationStatus, output, error)
        } catch {
            return (1, "", error.localizedDescription)
        }
    }

    private var sidecarAppleScript: String {
        return #"""
on run argv
set deviceName to item 1 of argv

tell application "System Events"
    if not (exists process "ControlCenter") then error "ControlCenter process not found"

    tell process "ControlCenter"
        set frontmost to true
        set mirrorItem to missing value

        repeat with itemRef in every menu bar item of menu bar 1
            set itemDescription to description of itemRef
            if itemDescription contains "Screen Mirroring" or itemDescription contains "Phản chiếu màn hình" then
                set mirrorItem to itemRef
                exit repeat
            end if
        end repeat

        if mirrorItem is missing value then error "Screen Mirroring menu item not found"

        click mirrorItem
    end tell
end tell

delay 0.9

tell application "System Events"
    tell process "ControlCenter"
        set ccWindow to window 1
        set targetElement to missing value

        repeat with candidate in entire contents of ccWindow
            try
                set candidateName to name of candidate
                if candidateName is deviceName or candidateName contains deviceName or candidateName contains "Hat" then
                    set targetElement to candidate
                    exit repeat
                end if
            end try
        end repeat

        if targetElement is missing value then error "Device not found: " & deviceName

        set targetRole to value of attribute "AXRole" of targetElement

        if targetRole is "AXStaticText" then
            click (value of attribute "AXParent" of targetElement)
        else
            click targetElement
        end if
    end tell
end tell

delay 0.2

tell application "System Events" to key code 53
return "ok"
end run
"""#
    }
}

let device = CommandLine.arguments.dropFirst().first ?? "Hat-Ipad"
let daemon = SidecarWakeDaemon(
    deviceName: device,
    logPath: "/Users/nguyenhat/HAgent/scripts/sidecar_wake_reconnect.log"
)
daemon.start()
RunLoop.main.run()
