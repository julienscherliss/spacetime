import ActivityKit
import Capacitor
import Foundation
import os

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

    // Capacitor invokes methods on its bridge queue. Every mutable state access
    // explicitly hops to the same main-actor owner, including load/refresh/end.
    @MainActor private lazy var state = LiveActivityState()

    public override func load() {
        super.load()
        Task { @MainActor [weak self] in self?.state.refreshStartObserver() }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in self?.state.isAvailable(call) }
    }
    @objc func getPushTokens(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in self?.state.getPushTokens(call) }
    }
    @objc func sync(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in self?.state.sync(call) }
    }
    @objc func end(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in self?.state.end(call) }
    }
}

@MainActor
private final class LiveActivityState {
    private var cachedPushToStartToken: String?
    private let startObserver = LiveActivityTokenObserver()
    private var cachedActivityTokens = LiveActivityTokenCache()
    private var activityObservers: [String: LiveActivityTokenObserver] = [:]
    private let logger = Logger(subsystem: "com.spacetimelabs.spacetime", category: "LiveActivities")

    func isAvailable(_ call: CAPPluginCall) {
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

    func getPushTokens(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve([
                "available": false,
                "reason": "requires_ios_16_2",
                "activityTokens": [],
            ])
            return
        }

        refreshStartObserver()
        var activityTokens: [[String: String]] = []
        let currentActivities = Activity<SpacetimeLiveActivityAttributes>.activities.filter {
            $0.activityState != .ended && $0.activityState != .dismissed
        }
        let currentIds = Set(currentActivities.map { $0.id })
        for id in Array(activityObservers.keys) where !currentIds.contains(id) {
            activityObservers.removeValue(forKey: id)?.cancel()
        }
        cachedActivityTokens.retain(activityIds: currentIds)
        for activity in currentActivities {
            if let token = activity.pushToken {
                cachedActivityTokens[activity.id] = token.hexString
                activityTokens.append([
                    "taskId": activity.attributes.taskId,
                    "token": token.hexString,
                ])
            } else if let token = cachedActivityTokens[activity.id] {
                activityTokens.append([
                    "taskId": activity.attributes.taskId,
                    "token": token,
                ])
            }
            observeActivityTokenUpdates(for: activity)
        }

        var response: [String: Any] = [
            "available": ActivityAuthorizationInfo().areActivitiesEnabled,
            "activityTokens": activityTokens,
            "activityTaskIds": currentActivities.map { $0.attributes.taskId },
            "apnsEnvironment": apnsEnvironment(),
            "bundleIdentifier": Bundle.main.bundleIdentifier ?? "",
            "supportsPushToStart": false,
        ]

        if #available(iOS 17.2, *) {
            response["supportsPushToStart"] = true
            if let pushToStartToken = Activity<SpacetimeLiveActivityAttributes>.pushToStartToken {
                response["pushToStartToken"] = pushToStartToken.hexString
            } else if let token = cachedPushToStartToken {
                response["pushToStartToken"] = token
            }
        }

        // Report observer state without exposing token values.
        response["diagnostics"] = [
            "iosVersion": UIDevice.current.systemVersion,
            "activitiesEnabled": ActivityAuthorizationInfo().areActivitiesEnabled,
            "observerRunning": startObserver.running,
            "observerPhase": startObserver.phase,
            "observerGeneration": startObserver.generation,
            "observerAgeSeconds": Int(startObserver.startedAt.map { Date().timeIntervalSince($0) } ?? 0),
            "startUpdateCount": startObserver.updateCount,
            "cachedStartTokenPresent": cachedPushToStartToken != nil,
            "activeActivityCount": currentActivities.count,
        ]
        call.resolve(response)
    }

    func sync(_ call: CAPPluginCall) {
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
            logger.error("Live Activity sync rejected: disabled authorization or invalid payload")
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
                let activity = try await syncActivity(taskId: taskId, state: state)
                var result: [String: Any] = ["active": true]
                if #available(iOS 16.2, *) {
                    observeActivityTokenUpdates(for: activity)
                    if let token = await activityToken(for: activity) {
                        result["activityToken"] = token
                    }
                }
                call.resolve(result)
            } catch {
                logger.error("Live Activity request failed: \(error.localizedDescription, privacy: .public)")
                call.reject("Live Activity sync failed: \(error.localizedDescription)")
            }
        }
    }

    func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["active": false])
            return
        }

        endAllActivities {
            call.resolve(["active": false])
        }
    }

    func refreshStartObserver() {
        guard #available(iOS 17.2, *) else { return }
        if let token = Activity<SpacetimeLiveActivityAttributes>.pushToStartToken {
            cachedPushToStartToken = token.hexString
        }
        startObserver.start(sequence: { Activity<SpacetimeLiveActivityAttributes>.pushToStartTokenUpdates }) { [weak self] token in
            self?.cachedPushToStartToken = token.hexString
        }
    }

    private func apnsEnvironment() -> String {
        let configured = Bundle.main.object(forInfoDictionaryKey: "SpacetimeAPNSEnvironment") as? String
        return configured?.isEmpty == false ? configured! : "development"
    }

    @available(iOS 16.1, *)
    private func syncActivity(taskId: String, state: SpacetimeLiveActivityAttributes.ContentState) async throws -> Activity<SpacetimeLiveActivityAttributes> {
        let matching = Activity<SpacetimeLiveActivityAttributes>.activities.filter { $0.attributes.taskId == taskId }
        let activityToKeep = matching.first
        var keptMatchingActivity = false

        for activity in Activity<SpacetimeLiveActivityAttributes>.activities {
            if activity.attributes.taskId == taskId && !keptMatchingActivity {
                keptMatchingActivity = true
                continue
            }
            await end(activity)
        }

        if let existing = activityToKeep {
            if #available(iOS 16.2, *) {
                await existing.update(ActivityContent(state: state, staleDate: staleDate(for: state)))
            } else {
                await existing.update(using: state)
            }
            return existing
        }

        let attributes = SpacetimeLiveActivityAttributes(taskId: taskId)
        if #available(iOS 16.2, *) {
            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: staleDate(for: state)),
                pushType: .token
            )
            observeActivityTokenUpdates(for: activity)
            return activity
        } else {
            return try Activity.request(attributes: attributes, contentState: state, pushType: nil)
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
        cachedActivityTokens[activity.id] = nil
        activityObservers.removeValue(forKey: activity.id)?.cancel()
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

    @available(iOS 16.2, *)
    private func observeActivityTokenUpdates(for activity: Activity<SpacetimeLiveActivityAttributes>) {
        let observer = activityObservers[activity.id] ?? LiveActivityTokenObserver()
        activityObservers[activity.id] = observer
        if let token = activity.pushToken {
            cachedActivityTokens[activity.id] = token.hexString
        }
        observer.start(sequence: { activity.pushTokenUpdates }) { [weak self] token in
            self?.cachedActivityTokens[activity.id] = token.hexString
        }
    }

    @available(iOS 16.2, *)
    private func activityToken(for activity: Activity<SpacetimeLiveActivityAttributes>) async -> String? {
        if let token = activity.pushToken?.hexString {
            cachedActivityTokens[activity.id] = token
            return token
        }

        if let token = cachedActivityTokens[activity.id] {
            return token
        }

        for _ in 0..<10 {
            try? await Task.sleep(nanoseconds: 200_000_000)
            if let token = activity.pushToken?.hexString {
                cachedActivityTokens[activity.id] = token
                return token
            }
            if let token = cachedActivityTokens[activity.id] {
                return token
            }
        }

        return nil
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
