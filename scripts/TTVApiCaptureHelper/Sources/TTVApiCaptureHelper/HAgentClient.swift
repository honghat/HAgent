import Foundation

struct TTVAnalyzeRequest: Encodable {
    let captureText: String
    let saveProfile: Bool

    enum CodingKeys: String, CodingKey {
        case captureText = "capture_text"
        case saveProfile = "save_profile"
    }
}

enum HAgentClientError: LocalizedError {
    case invalidURL
    case emptyCapture
    case badResponse(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "HAgent URL không hợp lệ"
        case .emptyCapture:
            return "Capture rỗng"
        case let .badResponse(message):
            return message
        }
    }
}

enum HAgentClient {
    static func analyzeTTVCapture(baseURL: String, token: String, captureText: String) async throws -> String {
        let trimmed = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw HAgentClientError.emptyCapture
        }

        let normalizedBase = baseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        var components = URLComponents(string: "\(normalizedBase)/api/app-tools/ttv/analyze-capture")
        let trimmedToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedToken.isEmpty {
            components?.queryItems = [URLQueryItem(name: "t", value: trimmedToken)]
        }
        guard let url = components?.url else {
            throw HAgentClientError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(TTVAnalyzeRequest(captureText: trimmed, saveProfile: true))

        let (data, response) = try await URLSession.shared.data(for: request)
        let bodyText = String(data: data, encoding: .utf8) ?? ""
        guard let http = response as? HTTPURLResponse else {
            throw HAgentClientError.badResponse(bodyText)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw HAgentClientError.badResponse("HTTP \(http.statusCode): \(bodyText)")
        }

        if let object = try? JSONSerialization.jsonObject(with: data),
           let pretty = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]),
           let prettyText = String(data: pretty, encoding: .utf8) {
            return prettyText
        }
        return bodyText
    }
}
