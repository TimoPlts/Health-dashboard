
// ---- Baseline POC native probes (appended to the generated AppDelegate.swift by native/patch-ios.sh) ----
// Results go to UserDefaults under the "CapacitorStorage." prefix so the web layer reads them with @capacitor/preferences.

enum BaselinePOCNative {
    static let refreshId = "app.baseline.poc.refresh"

    /// Must run before application(_:didFinishLaunchingWithOptions:) returns (BGTaskScheduler requirement).
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshId, using: nil) { task in
            guard let t = task as? BGAppRefreshTask else { task.setTaskCompleted(success: false); return }
            handle(t)
        }
        NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in schedule() }
        schedule()
        if Bundle.main.object(forInfoDictionaryKey: "BaselineHealthKitTest") as? Bool == true {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { healthKitProbe() }
        } else {
            set("healthkit", "Not tested in this build (install the HealthKit variant to test).")
        }
    }

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: refreshId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        do { try BGTaskScheduler.shared.submit(request); set("bgScheduleError", "") }
        catch { set("bgScheduleError", "\(error)") }
    }

    static func handle(_ task: BGAppRefreshTask) {
        schedule()
        task.expirationHandler = { task.setTaskCompleted(success: false) }
        let n = (Int(UserDefaults.standard.string(forKey: "CapacitorStorage.bgRunsCount") ?? "0") ?? 0) + 1
        set("bgRunsCount", String(n))
        set("bgLastRun", ISO8601DateFormatter().string(from: Date()))
        task.setTaskCompleted(success: true)
    }

    static func healthKitProbe() {
        guard HKHealthStore.isHealthDataAvailable() else { set("healthkit", "error: HealthKit is not available on this device"); return }
        let store = HKHealthStore()
        guard let steps = HKObjectType.quantityType(forIdentifier: .stepCount) else { return }
        store.requestAuthorization(toShare: [], read: [steps]) { ok, err in
            set("healthkit", ok ? "authorization request completed: the HealthKit entitlement was accepted" : "error: \(err?.localizedDescription ?? "unknown")")
        }
    }

    static func set(_ key: String, _ value: String) {
        UserDefaults.standard.set(value, forKey: "CapacitorStorage." + key)
    }
}
