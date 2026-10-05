import Foundation

// A single owner for each token stream. Completion clears the handle; refresh
// can restart it after a cooldown without churning a healthy, silent stream.
@MainActor
final class LiveActivityTokenObserver {
    private(set) var phase = "idle"
    private(set) var generation = 0
    private(set) var updateCount = 0
    private(set) var startedAt: Date?
    private var task: Task<Void, Never>?
    var running: Bool { phase == "entered" && task != nil }

    deinit { task?.cancel() }

    func start<S: AsyncSequence>(
        now: Date = Date(), restartDelay: TimeInterval = 30,
        sequence: @escaping () -> S,
        onToken: @escaping @MainActor (Data) -> Void
    ) where S.Element == Data {
        guard task == nil else { return }
        if let startedAt, now.timeIntervalSince(startedAt) < restartDelay { return }
        generation += 1
        let currentGeneration = generation
        startedAt = now
        phase = "scheduled"
        task = Task { @MainActor [weak self] in
            guard !Task.isCancelled else { return }
            self?.phase = "entered"
            do {
                for try await token in sequence() {
                    guard !Task.isCancelled,
                          self?.generation == currentGeneration,
                          self?.task != nil else { break }
                    self?.updateCount += 1
                    onToken(token)
                }
            } catch {
                // No credentials or provider payloads are logged here.
            }
            guard self?.generation == currentGeneration, self?.task != nil else { return }
            self?.phase = Task.isCancelled ? "cancelled" : "ended"
            self?.task = nil
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
        phase = "cancelled"
    }
}

// Task IDs can outlive an ActivityKit instance. Cache only by activity ID so
// recreating a Live Activity for the same task cannot inherit its old token.
struct LiveActivityTokenCache {
    private var tokens: [String: String] = [:]

    subscript(activityId: String) -> String? {
        get { tokens[activityId] }
        set { tokens[activityId] = newValue }
    }

    mutating func retain(activityIds: Set<String>) {
        tokens = tokens.filter { activityIds.contains($0.key) }
    }
}
