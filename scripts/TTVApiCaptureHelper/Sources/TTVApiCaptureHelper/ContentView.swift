import SwiftUI

struct ContentView: View {
    @StateObject private var model = AppModel()

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    limitationsCard
                    deviceCard
                    captureCard
                    hagentCard
                    logCard
                }
                .padding(20)
            }
        }
        .onAppear {
            model.refreshTools()
            model.refreshDevices()
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "ipad.and.iphone")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text("TTV iPad API Capture Helper")
                    .font(.title2.bold())
                Text("Kết nối iPad qua USB, bật RVI, capture traffic và gửi HAR/cURL vào HAgent")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if model.isBusy {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .padding(20)
    }

    private var limitationsCard: some View {
        Card(title: "Giới hạn kỹ thuật", systemImage: "exclamationmark.shield.fill") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Không có app Xcode nào đọc trực tiếp network của app TTV khác trên iPad được, vì iOS sandbox và HTTPS.")
                Text("RVI/tcpdump lấy được gói mạng/metadata. Muốn thấy URL JSON đầy đủ, dùng HAgent Proxy trong Giải trí > API App, cài CA tại http://mitm.it trên iPad rồi bật trust certificate.")
                Text("Nếu TTV dùng certificate pinning thì chỉ lấy được domain/path một phần; không nên jailbreak hoặc patch app.")
            }
            .font(.callout)
            .foregroundStyle(.secondary)
        }
    }

    private var deviceCard: some View {
        Card(title: "1. Chọn iPad", systemImage: "cable.connector") {
            VStack(alignment: .leading, spacing: 12) {
                toolStatusList
                HStack {
                    Button("Refresh Tools") {
                        model.refreshTools()
                    }
                    Button("Refresh iPad") {
                        model.refreshDevices()
                    }
                }

                if model.devices.isEmpty {
                    Text("Không thấy iPad. Cắm USB, mở khóa iPad, bấm Trust This Computer, và đảm bảo Xcode đầy đủ đã được cài/selected.")
                        .font(.callout)
                        .foregroundStyle(.orange)
                } else {
                    Picker("Device", selection: $model.selectedUDID) {
                        ForEach(model.devices) { device in
                            Text(device.label).tag(device.id)
                        }
                    }
                    .pickerStyle(.menu)
                }

                TextField("Nhập UDID thủ công nếu xctrace không thấy device", text: $model.manualUDID)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.body, design: .monospaced))

                HStack {
                    Button("Start RVI") {
                        model.startRVI()
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Stop RVI") {
                        model.stopRVI()
                    }
                }
            }
        }
    }

    private var toolStatusList: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(model.toolStatus, id: \.self) { line in
                Text(line)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(line.hasPrefix("OK") ? .secondary : .red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(nsColor: .textBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var captureCard: some View {
        Card(title: "2. Capture traffic qua USB", systemImage: "waveform.path.ecg") {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Interface")
                    TextField("rvi0", text: $model.capture.interfaceName)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 120)
                    Spacer()
                    if model.capture.isCapturing {
                        Text("Capturing · PID \(model.capture.pid)")
                            .font(.caption.bold())
                            .foregroundStyle(.green)
                    }
                }

                HStack {
                    Button("Start tcpdump") {
                        model.startPacketCapture()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.capture.isCapturing)

                    Button("Stop tcpdump") {
                        model.stopPacketCapture()
                    }
                    .disabled(!model.capture.isCapturing)

                    Button("Show PCAP") {
                        model.revealCaptureFile()
                    }
                    .disabled(model.capture.pcapPath.isEmpty)
                }

                Text("Sau khi start: mở app TTV trên iPad, tìm truyện, mở chi tiết, mở danh sách chương và mở một chương. Dừng capture rồi xem PCAP bằng Wireshark nếu cần domain/SNI.")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                if !model.capture.pcapPath.isEmpty {
                    Text(model.capture.pcapPath)
                        .font(.system(size: 12, design: .monospaced))
                        .textSelection(.enabled)
                }
            }
        }
    }

    private var hagentCard: some View {
        Card(title: "3. Gửi HAR/cURL vào HAgent", systemImage: "server.rack") {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    TextField("HAgent URL", text: $model.hagentBaseURL)
                        .textFieldStyle(.roundedBorder)
                    TextField("Token", text: $model.hagentToken)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 160)
                }

                TextEditor(text: $model.capturePasteText)
                    .font(.system(size: 12, design: .monospaced))
                    .frame(minHeight: 140)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.25))
                    )

                HStack {
                    Button("Analyze & Save TTV API Profile") {
                        model.analyzeInHAgent()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.capturePasteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Spacer()
                    Text("Paste HAR JSON hoặc cURL nếu cần fallback; luồng chính dùng HAgent Proxy trong API App.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if !model.analyzerResponse.isEmpty {
                    TextEditor(text: .constant(model.analyzerResponse))
                        .font(.system(size: 12, design: .monospaced))
                        .frame(minHeight: 160)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.green.opacity(0.35))
                        )
                }
            }
        }
    }

    private var logCard: some View {
        Card(title: "Log", systemImage: "terminal") {
            TextEditor(text: $model.logText)
                .font(.system(size: 12, design: .monospaced))
                .frame(minHeight: 180)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.gray.opacity(0.25))
                )
        }
    }
}

private struct Card<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                    .foregroundStyle(.orange)
                Text(title)
                    .font(.headline)
            }
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .windowBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }
}
