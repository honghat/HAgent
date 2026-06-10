import Foundation
import AppKit

struct CaptureSessionState {
    var udid: String = ""
    var interfaceName: String = "rvi0"
    var pid: String = ""
    var pcapPath: String = ""
    var logPath: String = ""
    var startedAt: Date?

    var isCapturing: Bool {
        !pid.isEmpty
    }
}

enum CaptureManager {
    static func startRVI(udid: String) throws -> String {
        let result = try Shell.runChecked("/usr/bin/xcrun", ["rvictl", "-s", udid])
        return result.stdout + result.stderr
    }

    static func stopRVI(udid: String) throws -> String {
        let result = try Shell.runChecked("/usr/bin/xcrun", ["rvictl", "-x", udid])
        return result.stdout + result.stderr
    }

    static func startTcpdump(interfaceName: String = "rvi0") throws -> CaptureSessionState {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        let stamp = formatter.string(from: Date())
        let desktop = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first
        let folder = desktop?.appendingPathComponent("TTV-iPad-Captures", isDirectory: true)
            ?? URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("TTV-iPad-Captures", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

        let pcapPath = folder.appendingPathComponent("ttv-ipad-\(stamp).pcap").path
        let logPath = folder.appendingPathComponent("ttv-ipad-\(stamp).log").path
        let command = [
            "nohup",
            "/usr/sbin/tcpdump",
            "-i", Shell.quote(interfaceName),
            "-s", "0",
            "-w", Shell.quote(pcapPath),
            ">", Shell.quote(logPath),
            "2>&1",
            "&",
            "echo $!"
        ].joined(separator: " ")

        let pid = try Shell.runAdminShell(command).trimmingCharacters(in: .whitespacesAndNewlines)
        var state = CaptureSessionState()
        state.interfaceName = interfaceName
        state.pid = pid
        state.pcapPath = pcapPath
        state.logPath = logPath
        state.startedAt = Date()
        return state
    }

    static func stopTcpdump(pid: String) throws {
        guard !pid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }
        _ = try Shell.runAdminShell("kill \(Shell.quote(pid)) 2>/dev/null || true")
    }

    static func reveal(path: String) {
        guard !path.isEmpty else {
            return
        }
        let url = URL(fileURLWithPath: path)
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }
}
