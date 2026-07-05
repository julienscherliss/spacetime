import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.1, *)
struct SpacetimeLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SpacetimeLiveActivityAttributes.self) { context in
            LiveActivityLockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.86))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 7) {
                        LiveActivityHeader(state: context.state, iconSize: 22, titleFont: .headline, timerFont: .caption.monospacedDigit())
                        LiveActivityProgressBar(startDate: context.state.startDate, endDate: context.state.endDate, isFreeTime: context.state.isFreeTime)
                        if let nextTitle = context.state.nextTitle, !nextTitle.isEmpty {
                            NextTaskLine(title: nextTitle, startDate: context.state.nextStartDate, showLabel: false)
                                .padding(.leading, 38)
                        }
                    }
                }
            } compactLeading: {
                LiveActivitySymbol(name: context.state.symbolName, size: 14)
            } compactTrailing: {
                LiveActivityTimeText(endDate: context.state.endDate, isFreeTime: context.state.isFreeTime, font: .caption.monospacedDigit())
            } minimal: {
                LiveActivitySymbol(name: context.state.symbolName, size: 12)
            }
        }
    }
}

@available(iOS 16.1, *)
private struct LiveActivitySymbol: View {
    let name: String
    let size: CGFloat

    var body: some View {
        Image(systemName: name.isEmpty ? "timer" : name)
            .font(.system(size: size, weight: .semibold))
            .symbolRenderingMode(.hierarchical)
    }
}

@available(iOS 16.1, *)
private struct LiveActivityHeader: View {
    let state: SpacetimeLiveActivityAttributes.ContentState
    let iconSize: CGFloat
    let titleFont: Font
    let timerFont: Font

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            LiveActivitySymbol(name: state.symbolName, size: iconSize)
                .frame(width: iconSize + 6, height: 34, alignment: .center)

            VStack(alignment: .leading, spacing: 2) {
                Text(state.title)
                    .font(titleFont)
                    .lineLimit(1)
                    .truncationMode(.tail)

                if let category = state.category, !category.isEmpty {
                    Text(shortCategory(category).uppercased())
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            .layoutPriority(1)

            Spacer(minLength: 8)

            LiveActivityTimeText(endDate: state.endDate, isFreeTime: state.isFreeTime, font: timerFont)
                .frame(minWidth: 56, alignment: .trailing)
        }
    }
}

@available(iOS 16.1, *)
private struct LiveActivityTimeText: View {
    let endDate: Date
    let isFreeTime: Bool
    let font: Font

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { context in
            if context.date >= endDate && isFreeTime {
                Text("Now")
                    .font(font)
                    .lineLimit(1)
                    .multilineTextAlignment(.trailing)
            } else if context.date >= endDate {
                Text("-\(overdueMinutes(at: context.date))m")
                    .font(font)
                    .monospacedDigit()
                    .lineLimit(1)
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(.orange)
            } else {
                Text(endDate, style: .timer)
                    .font(font)
                    .monospacedDigit()
                    .lineLimit(1)
                    .multilineTextAlignment(.trailing)
            }
        }
    }

    private func overdueMinutes(at date: Date) -> Int {
        max(0, Int(date.timeIntervalSince(endDate) / 60))
    }
}

private func shortCategory(_ category: String) -> String {
    category.split(separator: "/").last.map(String.init) ?? category
}

@available(iOS 16.1, *)
private struct LiveActivityProgressBar: View {
    let startDate: Date
    let endDate: Date
    let isFreeTime: Bool

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { context in
            GeometryReader { proxy in
                let progress = progress(at: context.date)
                ZStack(alignment: .leading) {
                    let isOverdue = context.date >= endDate && !isFreeTime
                    Capsule()
                        .fill(Color.white.opacity(0.13))
                    Capsule()
                        .fill(isOverdue ? Color.orange : Color.white)
                        .frame(width: max(5, proxy.size.width * progress))
                }
            }
        }
        .frame(height: 5)
    }

    private func progress(at date: Date) -> Double {
        let total = max(1, endDate.timeIntervalSince(startDate))
        let elapsed = min(max(0, date.timeIntervalSince(startDate)), total)
        return elapsed / total
    }
}

@available(iOS 16.1, *)
private struct NextTaskLine: View {
    let title: String
    let startDate: Date?
    let showLabel: Bool

    var body: some View {
        HStack(spacing: 4) {
            if showLabel {
                Text("Next")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }
            if let startDate {
                Text(startDate, style: .time)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.tail)
                .layoutPriority(1)
        }
    }
}

@available(iOS 16.1, *)
private struct LiveActivityLockScreenView: View {
    let state: SpacetimeLiveActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            LiveActivityHeader(state: state, iconSize: 28, titleFont: .headline, timerFont: .title3.monospacedDigit().weight(.semibold))
            LiveActivityProgressBar(startDate: state.startDate, endDate: state.endDate, isFreeTime: state.isFreeTime)

            if let nextTitle = state.nextTitle, !nextTitle.isEmpty {
                NextTaskLine(title: nextTitle, startDate: state.nextStartDate, showLabel: true)
                    .padding(.leading, 44)
            }
        }
        .padding()
    }
}
