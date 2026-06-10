import EventKit
import Foundation

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)

store.requestAccess(to: .event) { granted, error in
    defer { semaphore.signal() }
    guard granted else {
        print("❌ No Calendar permission")
        return
    }
    let calendars = store.calendars(for: .event)
    print("Available calendars:")
    for c in calendars {
        print("  - \(c.title)")
    }
}

_ = semaphore.wait(timeout: .now() + 10)
