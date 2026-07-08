import ActivityKit
import Capacitor
import Foundation

@objc(LiveActivitiesPlugin)
public class LiveActivitiesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivitiesPlugin"
    public let jsName = "LiveActivities"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPushTokens", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    private var cachedPushToStartToken: String?
    private var pushToStartTokenTask: Task<Void, Never>?

    public override func load() {
        super.load()
        startPushToStartTokenUpdates()
    }

    deinit {
        pushToStartTokenTask?.cancel()
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["available": false, "reason": "requires_ios_16_1"])
            return
        }

        let enabled = ActivityAuthorizationInfo().areActivitiesEnabled
        if enabled {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false, "reason": "disabled"])
        }
    }

    @objc func getPushTokens(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve([
                "available": false,
                "reason": "requires_ios_16_2",
                "activityTokens": [],
            ])
            return
        }

        var activityTokens: [[String: String]] = []
        for activity in Activity<SpacetimeLiveActivityAttributes>.activities {
            if let token = activity.pushToken {
                activityTokens.append([
                    "taskId": activity.attributes.taskId,
                    "token": token.hexString,
                ])
            }
        }

        var response: [String: Any] = [
            "available": ActivityAuthorizationInfo().areActivitiesEnabled,
            "activityTokens": activityTokens,
            "apnsEnvironment": apnsEnvironment(),
            "bundleIdentifier": Bundle.main.bundleIdentifier ?? "",
        ]

        if #available(iOS 17.2, *), let pushToStartToken = Activity<SpacetimeLiveActivityAttributes>.pushToStartToken {
            response["pushToStartToken"] = pushToStartToken.hexString
        } else if let token = cachedPushToStartToken {
            response["pushToStartToken"] = token
        }

        call.resolve(response)
    }

    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["active": false])
            return
        }

        let active = call.getBool("active") ?? false
        guard active else {
            endAllActivities {
                call.resolve(["active": false])
            }
            return
        }

        guard
            ActivityAuthorizationInfo().areActivitiesEnabled,
            let taskId = call.getString("taskId"),
            let title = call.getString("title"),
            let startAt = call.getString("startAt"),
            let endAt = call.getString("endAt"),
            let startDate = ISO8601DateFormatter.spacetime.date(from: startAt),
            let endDate = ISO8601DateFormatter.spacetime.date(from: endAt)
        else {
            call.reject("Live Activity payload is invalid or unavailable")
            return
        }

        let state = SpacetimeLiveActivityAttributes.ContentState(
            title: title,
            category: call.getString("category"),
            symbolName: call.getString("symbolName") ?? "timer",
            isFreeTime: call.getBool("isFreeTime") ?? false,
            startDate: startDate,
            endDate: endDate,
            nextTitle: call.getString("nextTitle"),
            nextStartDate: call.getString("nextStartAt").flatMap { ISO8601DateFormatter.spacetime.date(from: $0) }
        )

        Task {
            do {
                try await syncActivity(taskId: taskId, state: state)
                var result: [String: Any] = ["active": true]
                if #available(iOS 16.2, *),
                   let activity = Activity<SpacetimeLiveActivityAttributes>.activities.first,
                   let pushToken = activity.pushToken {
                    result["activityToken"] = pushToken.hexString
                }
                call.resolve(result)
            } catch {
                call.reject("Live Activity sync failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["active": false])
            return
        }

        endAllActivities {
            call.resolve(["active": false])
        }
    }

    private func startPushToStartTokenUpdates() {
        guard #available(iOS 17.2, *) else { return }
        guard pushToStartTokenTask == nil else { return }

        if let token = Activity<SpacetimeLiveActivityAttributes>.pushToStartToken {
            cachedPushToStartToken = token.hexString
        }

        pushToStartTokenTask = Task { [weak self] in
            for await token in Activity<SpacetimeLiveActivityAttributes>.pushToStartTokenUpdates {
                self?.cachedPushToStartToken = token.hexString
            }
        }
    }

    private func apnsEnvironment() -> String {
        let configured = Bundle.main.object(forInfoDictionaryKey: "SpacetimeAPNSEnvironment") as? String
        return configured?.isEmpty == false ? configured! : "development"
    }

    @available(iOS 16.1, *)
    private func syncActivity(taskId: String, state: SpacetimeLiveActivityAttributes.ContentState) async throws {
        let existing = Activity<SpacetimeLiveActivityAttributes>.activities.first

        if let existing, existing.attributes.taskId == taskId {
            if #available(iOS 16.2, *) {
                await existing.update(ActivityContent(state: state, staleDate: staleDate(for: state)))
            } else {
                await existing.update(using: state)
            }
            return
        }

        for activity in Activity<SpacetimeLiveActivityAttributes>.activities {
            await end(activity)
        }

        let attributes = SpacetimeLiveActivityAttributes(taskId: taskId)
        if #available(iOS 16.2, *) {
            _ = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: staleDate(for: state)),
                pushType: .token
            )
        } else {
            _ = try Activity.request(attributes: attributes, contentState: state, pushType: nil)
        }
    }

    @available(iOS 16.1, *)
    private func endAllActivities(completion: @escaping () -> Void) {
        Task {
            for activity in Activity<SpacetimeLiveActivityAttributes>.activities {
                await end(activity)
            }
            completion()
        }
    }

    @available(iOS 16.1, *)
    private func end(_ activity: Activity<SpacetimeLiveActivityAttributes>) async {
        if #available(iOS 16.2, *) {
            await activity.end(nil, dismissalPolicy: .immediate)
        } else {
            await activity.end(dismissalPolicy: .immediate)
        }
    }

    @available(iOS 16.1, *)
    private func staleDate(for state: SpacetimeLiveActivityAttributes.ContentState) -> Date {
        state.endDate.addingTimeInterval(state.isFreeTime ? 5 * 60 : 4 * 60 * 60)
    }
}

private extension Data {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}

private extension ISO8601DateFormatter {
    static let spacetime: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
