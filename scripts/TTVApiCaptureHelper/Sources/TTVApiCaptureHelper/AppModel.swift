import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published var devices: [IOSDevice] = []
    @Published var selectedUDID: String = ""
    @Published var manualUDID: String = ""
    @Published var toolStatus: [String] = []
    @Published var logText: String = ""
    @Published var capture = CaptureSessionState()
    @Published var capturePasteText: String = ""
    @Published var hagentBaseURL: String = "http://127.0.0.1:8010"
    @Published var hagentToken: String = "hat"
    @Published var analyzerResponse: String = ""
    @Published var isBusy: Bool = false

    var effectiveUDID: String {
        let manual = manualUDID.trimmingCharacters(in: .whitespacesAndNewlines)
        return manual.isEmpty ? selectedUDID : manual
    }

    func appendLog(_ message: String) {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        logText += "[\(formatter.string(from: Date()))] \(message)\n"
    }

    func refreshTools() {
        toolStatus = DeviceManager.developerToolStatus()
    }

    func refreshDevices() {
        isBusy = true
        defer { isBusy = false }
        do {
            devices = try DeviceManager.listDevices()
            if selectedUDID.isEmpty, let first = devices.first {
                selectedUDID = first.id
            }
            appendLog("Đã tìm thấy \(devices.count) iOS/iPadOS device.")
        } catch {
            devices = []
            appendLog("Không liệt kê được device: \(error.localizedDescription)")
        }
    }

    func startRVI() {
        let udid = effectiveUDID
        guard !udid.isEmpty else {
            appendLog("Chưa chọn/nhập UDID iPad.")
            return
        }
        isBusy = true
        defer { isBusy = false }
        do {
            let output = try CaptureManager.startRVI(udid: udid)
            capture.udid = udid
            appendLog("Đã start RVI cho \(udid).")
            if !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                appendLog(output)
            }
        } catch {
            appendLog("Start RVI lỗi: \(error.localizedDescription)")
        }
    }

    func stopRVI() {
        let udid = effectiveUDID.isEmpty ? capture.udid : effectiveUDID
        guard !udid.isEmpty else {
            appendLog("Chưa có UDID để stop RVI.")
            return
        }
        isBusy = true
        defer { isBusy = false }
        do {
            let output = try CaptureManager.stopRVI(udid: udid)
            appendLog("Đã stop RVI cho \(udid).")
            if !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                appendLog(output)
            }
        } catch {
            appendLog("Stop RVI lỗi: \(error.localizedDescription)")
        }
    }

    func startPacketCapture() {
        isBusy = true
        defer { isBusy = false }
        do {
            capture = try CaptureManager.startTcpdump(interfaceName: capture.interfaceName)
            appendLog("Đang capture \(capture.interfaceName), PID \(capture.pid).")
            appendLog("PCAP: \(capture.pcapPath)")
        } catch {
            appendLog("Start tcpdump lỗi: \(error.localizedDescription)")
        }
    }

    func stopPacketCapture() {
        isBusy = true
        defer { isBusy = false }
        do {
            try CaptureManager.stopTcpdump(pid: capture.pid)
            appendLog("Đã stop tcpdump PID \(capture.pid). File PCAP: \(capture.pcapPath)")
            capture.pid = ""
        } catch {
            appendLog("Stop tcpdump lỗi: \(error.localizedDescription)")
        }
    }

    func revealCaptureFile() {
        CaptureManager.reveal(path: capture.pcapPath)
    }

    func analyzeInHAgent() {
        isBusy = true
        analyzerResponse = ""
        Task {
            do {
                let response = try await HAgentClient.analyzeTTVCapture(
                    baseURL: hagentBaseURL,
                    token: hagentToken,
                    captureText: capturePasteText
                )
                analyzerResponse = response
                appendLog("Đã gửi capture vào HAgent analyzer.")
            } catch {
                appendLog("Analyze HAgent lỗi: \(error.localizedDescription)")
            }
            isBusy = false
        }
    }
}
