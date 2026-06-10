import Foundation

struct ShellResult {
    let status: Int32
    let stdout: String
    let stderr: String
}

enum ShellError: LocalizedError {
    case commandFailed(command: String, status: Int32, stderr: String)

    var errorDescription: String? {
        switch self {
        case let .commandFailed(command, status, stderr):
            let message = stderr.trimmingCharacters(in: .whitespacesAndNewlines)
            return "\(command) failed with status \(status)\(message.isEmpty ? "" : ": \(message)")"
        }
    }
}

enum Shell {
    static func run(_ executable: String, _ arguments: [String] = []) throws -> ShellResult {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        try process.run()
        process.waitUntilExit()

        let stdout = String(data: stdoutPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let stderr = String(data: stderrPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        return ShellResult(status: process.terminationStatus, stdout: stdout, stderr: stderr)
    }

    static func runChecked(_ executable: String, _ arguments: [String] = []) throws -> ShellResult {
        let result = try run(executable, arguments)
        if result.status != 0 {
            throw ShellError.commandFailed(command: ([executable] + arguments).joined(separator: " "), status: result.status, stderr: result.stderr)
        }
        return result
    }

    static func runAdminShell(_ command: String) throws -> String {
        let escaped = command
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        let script = "do shell script \"\(escaped)\" with administrator privileges"
        return try runChecked("/usr/bin/osascript", ["-e", script]).stdout
    }

    static func quote(_ value: String) -> String {
        "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}
