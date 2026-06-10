import EventKit
import Foundation

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)

// macOS 14+ could use requestFullAccessToEventsWithCompletion instead
store.requestAccess(to: .event) { granted, error in
    defer { semaphore.signal() }
    guard granted else {
        print("❌ No Calendar permission. Grant it in: System Settings > Privacy & Security > Calendar > Terminal")
        return
    }
    
    // Find the target calendar — change title as needed
    let calendars = store.calendars(for: .event)
    guard let targetCal = calendars.first(where: { $0.title == "Nhà" }) else {
        print("❌ Calendar 'Nhà' not found. Available:")
        for c in calendars { print("  - \(c.title)") }
        return
    }
    
    let event = EKEvent(eventStore: store)
    event.title = "Kêu em dậy 7h17"
    event.calendar = targetCal
    
    let now = Date()
    var components = Calendar.current.dateComponents([.year, .month, .day], from: now)
    components.hour = 7
    components.minute = 17
    components.second = 0
    guard let startDate = Calendar.current.date(from: components) else {
        print("❌ Failed to build start date")
        return
    }
    event.startDate = startDate
    event.endDate = startDate.addingTimeInterval(3600) // 1 hour duration
    
    // Daily recurrence
    let recurrence = EKRecurrenceRule(
        recurrenceWith: .daily,
        interval: 1,
        end: nil
    )
    event.addRecurrenceRule(recurrence)
    
    // Alarm 5 minutes before
    let alarm = EKAlarm(relativeOffset: -300)
    event.addAlarm(alarm)
    
    do {
        try store.save(event, span: .thisEvent)
        print("✅ Created '\(event.title)' daily at \(components.hour!):\(String(format: "%02d", components.minute!)) in '\(targetCal.title)'")
    } catch {
        print("❌ Error: \(error.localizedDescription)")
    }
}

_ = semaphore.wait(timeout: .now() + 10)
