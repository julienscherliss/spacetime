"""Run the shared Swift Codable implementation without the iOS-only protocol."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
source = (root / 'ios/App/Shared/SpacetimeLiveActivityAttributes.swift').read_text()
source = source.replace('import ActivityKit\n', '').replace(': ActivityAttributes {', ': Codable {')
harness = r'''
let start = Date(timeIntervalSince1970: 1_800_000_000)
for nextDate in [nil, start.addingTimeInterval(3600)] as [Date?] {
    let original = SpacetimeLiveActivityAttributes.ContentState(
        title: "Test", category: nil, symbolName: "timer", isFreeTime: false,
        startDate: start, endDate: start.addingTimeInterval(1800),
        nextTitle: nextDate == nil ? nil : "Next", nextStartDate: nextDate)
    let encoded = try JSONEncoder().encode(original)
    let decoded = try JSONDecoder().decode(SpacetimeLiveActivityAttributes.ContentState.self, from: encoded)
    precondition(decoded == original, "Native state must round-trip with and without a next task")
    var object = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
    object["nextStartDate"] = NSNull()
    let explicitNull = try JSONSerialization.data(withJSONObject: object)
    let nullDecoded = try JSONDecoder().decode(SpacetimeLiveActivityAttributes.ContentState.self, from: explicitNull)
    precondition(nullDecoded.nextStartDate == nil, "Explicit null must decode as absent")
    object["nextStartDate"] = 1_800_003_600
    let numeric = try JSONSerialization.data(withJSONObject: object)
    let numericDecoded = try JSONDecoder().decode(SpacetimeLiveActivityAttributes.ContentState.self, from: numeric)
    precondition(numericDecoded.nextStartDate == start.addingTimeInterval(3600))
    object.removeValue(forKey: "startDate")
    let missingRequired = try JSONSerialization.data(withJSONObject: object)
    do {
        _ = try JSONDecoder().decode(SpacetimeLiveActivityAttributes.ContentState.self, from: missingRequired)
        fatalError("Required start date must remain required")
    } catch DecodingError.keyNotFound { }
}
print("Live Activity Swift coding checks passed: omitted/null/present optional dates, numeric dates, required dates")
'''
with tempfile.TemporaryDirectory(prefix='spacetime-coding-') as directory:
    path = Path(directory) / 'main.swift'
    path.write_text(source + harness)
    subprocess.run(['xcrun', 'swift', str(path)], check=True)
