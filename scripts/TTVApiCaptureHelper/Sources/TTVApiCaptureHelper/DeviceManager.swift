import Foundation

struct IOSDevice: Identifiable, Hashable {
    let id: String
    let name: String
    let osVersion: String

    var label: String {
        osVersion.isEmpty ? "\(name) · \(id)" : "\(name) · iOS/iPadOS \(osVersion) · \(id)"
    }
}

enum DeviceManager {
    static func developerToolStatus() -> [String] {
        var lines: [String] = []
        let checks = [
            ("xcode-select", "/usr/bin/xcode-select", ["-p"]),
            ("xctrace", "/usr/bin/xcrun", ["--find", "xctrace"]),
            ("rvictl", "/usr/bin/xcrun", ["--find", "rvictl"]),
            ("tcpdump", "/usr/bin/which", ["tcpdump"])
        ]

        for (name, executable, args) in checks {
            do {
                let result = try Shell.run(executable, args)
                if result.status == 0 {
                    let value = result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
                    lines.append("OK \(name): \(value)")
                } else {
                    let value = result.stderr.trimmingCharacters(in: .whitespacesAndNewlines)
                    lines.append("Missing \(name): \(value)")
                }
            } catch {
                lines.append("Missing \(name): \(error.localizedDescription)")
            }
        }
        return lines
    }

    static func listDevices() throws -> [IOSDevice] {
        let result = try Shell.run("/usr/bin/xcrun", ["xctrace", "list", "devices"])
        if result.status == 0 {
            let devices = parseXctraceDevices(result.stdout)
            if !devices.isEmpty {
                return devices
            }
        }

        let fallback = try Shell.run("/usr/sbin/system_profiler", ["SPUSBDataType"])
        if fallback.status == 0 {
            let devices = parseSystemProfilerDevices(fallback.stdout)
            if !devices.isEmpty {
                return devices
            }
        }

        throw ShellError.commandFailed(command: "xcrun xctrace list devices", status: result.status, stderr: result.stderr)
    }

    static func parseXctraceDevices(_ output: String) -> [IOSDevice] {
        var devices: [IOSDevice] = []
        var inDevicesSection = false
        let pattern = #"^(.+?)(?: \(([^()]*)\))? \(([0-9A-Fa-f-]{20,})\)$"#
        let regex = try? NSRegularExpression(pattern: pattern)

        for rawLine in output.split(separator: "\n") {
            let line = String(rawLine).trimmingCharacters(in: .whitespacesAndNewlines)
            if line == "== Devices ==" {
                inDevicesSection = true
                continue
            }
            if line.hasPrefix("== ") && line != "== Devices ==" {
                inDevicesSection = false
            }
            guard inDevicesSection, !line.isEmpty, !line.contains("Mac") else {
                continue
            }

            let range = NSRange(line.startIndex..<line.endIndex, in: line)
            guard let match = regex?.firstMatch(in: line, range: range),
                  match.numberOfRanges >= 4,
                  let nameRange = Range(match.range(at: 1), in: line),
                  let udidRange = Range(match.range(at: 3), in: line)
            else {
                continue
            }

            let osVersion: String
            if let range = Range(match.range(at: 2), in: line) {
                osVersion = String(line[range])
            } else {
                osVersion = ""
            }

            let name = String(line[nameRange])
            let udid = String(line[udidRange])
            devices.append(IOSDevice(id: udid, name: name, osVersion: osVersion))
        }

        return devices
    }

    static func parseSystemProfilerDevices(_ output: String) -> [IOSDevice] {
        var devices: [IOSDevice] = []
        var currentName: String?

        for rawLine in output.split(separator: "\n") {
            let line = String(rawLine).trimmingCharacters(in: .whitespacesAndNewlines)
            if line.hasSuffix(":") {
                let name = String(line.dropLast())
                if name.localizedCaseInsensitiveContains("ipad")
                    || name.localizedCaseInsensitiveContains("iphone")
                    || name.localizedCaseInsensitiveContains("ipod") {
                    currentName = name
                }
            }

            if line.hasPrefix("Serial Number:"),
               let name = currentName {
                let serial = line.replacingOccurrences(of: "Serial Number:", with: "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !serial.isEmpty {
                    devices.append(IOSDevice(id: serial, name: name, osVersion: ""))
                }
                currentName = nil
            }
        }

        return devices
    }
}
