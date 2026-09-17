import XCTest

@MainActor
final class SiriTripUITests: XCTestCase {
    func testAppLaunchesDirectlyIntoSiriAndCompletesTripFlow() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()

        assertAppInterface(app)
        capture(app, name: "Direct Siri entry")

        let composer = app.textFields["messageField"]
        XCTAssertTrue(composer.waitForExistence(timeout: 10))
        XCTAssertTrue(composer.isHittable)
        composer.tap()
        composer.typeText("I want to plan a trip to Chicago")

        let sendButton = app.buttons["sendMessage"]
        XCTAssertTrue(sendButton.waitForExistence(timeout: 5))
        XCTAssertTrue(sendButton.isHittable)
        XCTAssertGreaterThanOrEqual(sendButton.frame.height, 44)
        sendButton.tap()

        let preferredDates = app.buttons["Yes"]
        XCTAssertTrue(preferredDates.waitForExistence(timeout: 10))
        XCTAssertTrue(preferredDates.isHittable)
        capture(app, name: "iPhone conversation")

        XCTAssertEqual(app.staticTexts.matching(identifier: "I want to plan a trip to Chicago").count, 1)
        XCTAssertEqual(app.staticTexts.matching(identifier: "Morning, Grace. What can I help you with?").count, 1)
        preferredDates.tap()

        XCTAssertTrue(app.staticTexts["July 2026"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["1"].exists)
        XCTAssertTrue(app.staticTexts["2"].exists)
        XCTAssertTrue(app.staticTexts["31"].exists)
        let confirmDates = app.buttons["Jul 1 - Jul 7 selected"]
        XCTAssertTrue(confirmDates.isHittable)
        capture(app, name: "iPhone calendar")
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.staticTexts["July 2026"].waitForExistence(timeout: 10))
        confirmDates.tap()

        for option in ["$500", "Boat tour", "Pizza, Culver's", "Near the Loop", "Open plan"] {
            let button = app.buttons[option]
            XCTAssertTrue(button.waitForExistence(timeout: 15))
            let messages = app.scrollViews.firstMatch
            messages.swipeUp()
            assertAppInterface(app)
            let hittable = button.wait(for: \.isHittable, toEqual: true, timeout: 5)
            if !hittable { capture(app, name: "Conversation before \(option)") }
            XCTAssertTrue(
                hittable,
                "\(option) should be tappable after the conversation scrolls"
            )
            XCTAssertTrue(messages.frame.contains(button.frame), "\(option) should be fully visible")
            button.tap()
        }

        XCTAssertTrue(app.staticTexts["Flight options"].waitForExistence(timeout: 10))
        app.buttons["Book all for me"].tap()
        XCTAssertTrue(app.staticTexts["Hotel options"].waitForExistence(timeout: 10))
        app.buttons["Book"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Suggested itinerary"].waitForExistence(timeout: 10))
    }

    func testSystemHomePreservesUnsentDraft() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        assertAppInterface(app)
        let composer = app.textFields["messageField"]
        composer.tap()
        composer.typeText("Unsent trip idea")

        returnToSystemHome(from: app)
        app.activate()
        assertAppInterface(app)
        XCTAssertEqual(composer.value as? String, "Unsent trip idea")
        XCTAssertEqual(app.staticTexts.matching(identifier: "Morning, Grace. What can I help you with?").count, 1)
    }

    func testWidgetLinkLaunchesSiriWithoutSystemReplicas() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.terminate()
        app.open(try XCTUnwrap(URL(string: "siritrip://open")))
        assertAppInterface(app)
        XCTAssertTrue(app.textFields["messageField"].isHittable)
        XCTAssertEqual(app.staticTexts.matching(identifier: "Morning, Grace. What can I help you with?").count, 1)
    }

    func testTodayWidgetOpensAppFromTheRealSystemScreen() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        showTodayView(springboard, leaving: app)
        capture(springboard, name: "Real Today View")

        let today = springboard.scrollViews["left-of-home-scroll-view"]
        let widget = today.icons["Siri Trip"].firstMatch
        try XCTSkipUnless(
            widget.waitForExistence(timeout: 5),
            "Add the Siri Trip widget to the real Today View before running this system integration test."
        )
        if !widget.isHittable { today.swipeUp() }
        XCTAssertTrue(widget.isHittable)
        capture(springboard, name: "Siri Trip on real Today View")
        app.terminate()
        widget.tap()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
        assertAppInterface(app)
        let composer = app.textFields["messageField"]
        XCTAssertTrue(composer.isHittable)
        composer.tap()
        composer.typeText("Widget return draft")
        showTodayView(springboard, leaving: app)
        if !widget.isHittable { today.swipeUp() }
        widget.tap()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
        XCTAssertEqual(composer.value as? String, "Widget return draft")
        showTodayView(springboard, leaving: app)
    }

    private func returnToSystemHome(from app: XCUIApplication) {
        XCUIDevice.shared.press(.home)
        let backgrounded = app.wait(for: .runningBackground, timeout: 5)
        XCTAssertTrue(backgrounded || app.state == .runningBackgroundSuspended)
    }

    private func showTodayView(_ springboard: XCUIApplication, leaving app: XCUIApplication) {
        returnToSystemHome(from: app)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(springboard.wait(for: .runningForeground, timeout: 10))
        let today = springboard.scrollViews["left-of-home-scroll-view"]
        for _ in 0..<3 {
            if today.isHittable { break }
            springboard.swipeRight()
        }
        XCTAssertTrue(today.waitForExistence(timeout: 5))
        XCTAssertTrue(today.isHittable)
    }

    private func assertAppInterface(
        _ app: XCUIApplication,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let page = app.descendants(matching: .any).matching(identifier: "siriScreen").firstMatch
        XCTAssertTrue(page.waitForExistence(timeout: 15), "Expected the app's own interface", file: file, line: line)
        XCTAssertTrue(page.isHittable, file: file, line: line)
        for other in ["homeScreen", "summaryScreen", "homeScreenPager", "appLibrarySearch", "homePageIndicator"] {
            XCTAssertFalse(
                app.descendants(matching: .any).matching(identifier: other).firstMatch.exists,
                "\(other) must not be recreated inside the app", file: file, line: line
            )
        }
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}