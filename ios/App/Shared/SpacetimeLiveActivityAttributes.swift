import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct SpacetimeLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String
        var category: String?
        var symbolName: String
        var isFreeTime: Bool
        var startDate: Date
        var endDate: Date
        var nextTitle: String?
        var nextStartDate: Date?

        init(
            title: String,
            category: String?,
            symbolName: String,
            isFreeTime: Bool,
            startDate: Date,
            endDate: Date,
            nextTitle: String?,
            nextStartDate: Date?
        ) {
            self.title = title
            self.category = category
            self.symbolName = symbolName
            self.isFreeTime = isFreeTime
            self.startDate = startDate
            self.endDate = endDate
            self.nextTitle = nextTitle
            self.nextStartDate = nextStartDate
        }

        enum CodingKeys: String, CodingKey {
            case title
            case category
            case symbolName
            case isFreeTime
            case startDate
            case endDate
            case nextTitle
            case nextStartDate
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            title = try container.decode(String.self, forKey: .title)
            category = try container.decodeIfPresent(String.self, forKey: .category)
            symbolName = try container.decode(String.self, forKey: .symbolName)
            isFreeTime = try container.decode(Bool.self, forKey: .isFreeTime)
            startDate = try Self.decodeDate(from: container, forKey: .startDate)
            endDate = try Self.decodeDate(from: container, forKey: .endDate)
            nextTitle = try container.decodeIfPresent(String.self, forKey: .nextTitle)
            nextStartDate = try Self.decodeOptionalDate(from: container, forKey: .nextStartDate)
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(title, forKey: .title)
            try container.encodeIfPresent(category, forKey: .category)
            try container.encode(symbolName, forKey: .symbolName)
            try container.encode(isFreeTime, forKey: .isFreeTime)
            try container.encode(Self.formatDate(startDate), forKey: .startDate)
            try container.encode(Self.formatDate(endDate), forKey: .endDate)
            try container.encodeIfPresent(nextTitle, forKey: .nextTitle)
            if let nextStartDate {
                try container.encode(Self.formatDate(nextStartDate), forKey: .nextStartDate)
            }
        }

        private static func decodeOptionalDate(
            from container: KeyedDecodingContainer<CodingKeys>,
            forKey key: CodingKeys
        ) throws -> Date? {
            if try container.decodeNil(forKey: key) { return nil }
            return try decodeDate(from: container, forKey: key)
        }

        private static func decodeDate(
            from container: KeyedDecodingContainer<CodingKeys>,
            forKey key: CodingKeys
        ) throws -> Date {
            if let stringValue = try? container.decode(String.self, forKey: key),
               let date = ISO8601DateFormatter.spacetime.date(from: stringValue) {
                return date
            }

            if let unixSeconds = try? container.decode(Double.self, forKey: key) {
                return Date(timeIntervalSince1970: unixSeconds)
            }

            return try container.decode(Date.self, forKey: key)
        }

        private static func formatDate(_ date: Date) -> String {
            ISO8601DateFormatter.spacetime.string(from: date)
        }
    }

    var taskId: String
}

private extension ISO8601DateFormatter {
    static let spacetime: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
