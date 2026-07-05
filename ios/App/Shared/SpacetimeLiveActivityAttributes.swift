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
    }

    var taskId: String
}
