import Foundation

@main
struct ObserverTests {
    @MainActor static func settle(_ condition: () -> Bool) async {
        for _ in 0..<100 {
            if condition() { return }
            try? await Task.sleep(nanoseconds: 1_000_000)
        }
        precondition(condition(), "Observer did not reach the expected state")
    }

    @MainActor static func main() async {
        let observer = LiveActivityTokenObserver()
        let (stream, continuation) = AsyncStream<Data>.makeStream()
        var streamsOpened = 0
        var received: [Data] = []
        let start = Date()
        observer.start(now: start, sequence: { streamsOpened += 1; return stream }) { received.append($0) }
        precondition(observer.phase == "scheduled" && observer.generation == 1)
        // A refresh must preserve a running stream even when no token arrived.
        observer.start(now: start.addingTimeInterval(60), sequence: { streamsOpened += 1; return stream }) { received.append($0) }
        await settle { observer.running }
        precondition(streamsOpened == 1 && observer.generation == 1)
        continuation.yield(Data([1]))
        await settle { observer.updateCount == 1 }
        precondition(received == [Data([1])])
        continuation.finish()
        await settle { observer.phase == "ended" }
        precondition(!observer.running)
        let (next, nextContinuation) = AsyncStream<Data>.makeStream()
        observer.start(now: start.addingTimeInterval(5), sequence: { streamsOpened += 1; return next }) { received.append($0) }
        precondition(observer.generation == 1, "Finished streams must respect cooldown")
        observer.start(now: start.addingTimeInterval(31), sequence: { streamsOpened += 1; return next }) { received.append($0) }
        await settle { observer.running && observer.generation == 2 }
        precondition(streamsOpened == 2)
        observer.cancel()
        precondition(observer.phase == "cancelled" && !observer.running)
        nextContinuation.yield(Data([2]))
        let (replacement, replacementContinuation) = AsyncStream<Data>.makeStream()
        observer.start(now: start.addingTimeInterval(62), sequence: { replacement }) { received.append($0) }
        await settle { observer.running && observer.generation == 3 }
        replacementContinuation.yield(Data([3]))
        await settle { observer.updateCount == 2 }
        precondition(received == [Data([1]), Data([3])], "Cancelled generations must not deliver tokens")
        observer.cancel()
        // The stream task must not retain its owner forever on a quiet sequence.
        var owned: LiveActivityTokenObserver? = LiveActivityTokenObserver()
        weak var weakOwned = owned
        let (quiet, _) = AsyncStream<Data>.makeStream()
        owned?.start(sequence: { quiet }) { _ in }
        await settle { owned?.running == true }
        owned = nil
        precondition(weakOwned == nil, "Observer teardown must cancel without a retain cycle")
        // Two ActivityKit instances for the same task must have independent
        // credentials, including the interval before the new token arrives.
        var cache = LiveActivityTokenCache()
        let oldActivityId = "activity-instance-A"
        let newActivityId = "activity-instance-B"
        let oldWatcher = LiveActivityTokenObserver()
        let (oldTokens, oldContinuation) = AsyncStream<Data>.makeStream()
        oldWatcher.start(sequence: { oldTokens }) { token in
            cache[oldActivityId] = token.map { String(format: "%02x", $0) }.joined()
        }
        oldContinuation.yield(Data([10]))
        await settle { cache[oldActivityId] == "0a" }
        precondition(cache[newActivityId] == nil, "Replacement must not inherit the old token")
        oldWatcher.cancel()
        cache.retain(activityIds: [newActivityId])
        precondition(cache[oldActivityId] == nil && cache[newActivityId] == nil)
        let newWatcher = LiveActivityTokenObserver()
        let (newTokens, newContinuation) = AsyncStream<Data>.makeStream()
        newWatcher.start(sequence: { newTokens }) { token in
            cache[newActivityId] = token.map { String(format: "%02x", $0) }.joined()
        }
        oldContinuation.yield(Data([11]))
        newContinuation.yield(Data([12]))
        await settle { cache[newActivityId] == "0c" }
        precondition(cache[oldActivityId] == nil, "Cancelled old watcher must not repopulate its cache")
        newWatcher.cancel()
        cache[newActivityId] = nil
        precondition(cache[newActivityId] == nil, "Ending an instance clears its token")
        print("Native observer lifecycle and replacement-token isolation checks passed")
    }
}
