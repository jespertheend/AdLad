import { assertEquals } from "$std/testing/asserts.ts";
import { assertSpyCall, assertSpyCalls, spy, stub } from "$std/testing/mock.ts";
import { AdLad } from "../../src/AdLad.js";
import { assertPromiseResolved, initializingPluginTest, waitForMicrotasks } from "../shared.js";

Deno.test({
	name: "showFullScreenAd when no plugin is active",
	async fn() {
		const adLad = new AdLad();

		const result = await adLad.showFullScreenAd();
		assertEquals(result, {
			didShowAd: false,
			errorReason: "no-active-plugin",
		});
	},
});

Deno.test({
	name: "showFullScreenAd not supported by plugin",
	async fn() {
		/** @type {import("../../src/AdLad.js").AdLadPlugin} */
		const plugin = {
			name: "plugin",
		};
		const adLad = new AdLad([plugin]);
		assertEquals(await adLad.showFullScreenAd(), {
			didShowAd: false,
			errorReason: "not-supported",
		});
	},
});

Deno.test({
	name: "showRewardedAd when no plugin is active",
	async fn() {
		const adLad = new AdLad();

		const result = await adLad.showRewardedAd();
		assertEquals(result, {
			didShowAd: false,
			errorReason: "no-active-plugin",
		});
	},
});

Deno.test({
	name: "showRewardedAd not supported by plugin",
	async fn() {
		/** @type {import("../../src/AdLad.js").AdLadPlugin} */
		const plugin = {
			name: "plugin",
		};
		const adLad = new AdLad([plugin]);
		assertEquals(await adLad.showRewardedAd(), {
			didShowAd: false,
			errorReason: "not-supported",
		});
	},
});

function createSpyPlugin() {
	/** @type {import("../../src/AdLad.js").AdLadPlugin} */
	const plugin = {
		name: "plugin",
		async showFullScreenAd() {
			return {
				didShowAd: true,
				errorReason: null,
			};
		},
	};
	const showSpy = spy(plugin, "showFullScreenAd");
	return { showSpy, plugin };
}

Deno.test({
	name: "Calls are passed on to the plugin",
	async fn() {
		const { plugin, showSpy } = createSpyPlugin();
		const adLad = new AdLad([plugin]);
		const promise = adLad.showFullScreenAd();
		await waitForMicrotasks();
		assertSpyCalls(showSpy, 1);
		assertEquals(await promise, {
			didShowAd: true,
			errorReason: null,
		});
	},
});

Deno.test({
	name: "Doesn't fire on plugin until it has been initialized",
	async fn() {
		const { plugin, showSpy } = createSpyPlugin();
		const { adLad, resolveInitialize } = initializingPluginTest(plugin);

		const promise = adLad.showFullScreenAd();

		await waitForMicrotasks();
		assertSpyCalls(showSpy, 0);
		await assertPromiseResolved(promise, false);

		await resolveInitialize();
		assertSpyCalls(showSpy, 1);
		await assertPromiseResolved(promise, true);
		assertEquals(await promise, {
			didShowAd: true,
			errorReason: null,
		});
	},
});

Deno.test({
	name: "Results in an 'already-playing' error when called twice while plugin is still initializing",
	async fn() {
		const { plugin } = createSpyPlugin();
		const { adLad, resolveInitialize } = initializingPluginTest(plugin);

		const promise1 = adLad.showFullScreenAd();
		const promise2 = adLad.showFullScreenAd();
		const promise3 = adLad.showFullScreenAd();
		await assertPromiseResolved(promise1, false);
		await assertPromiseResolved(promise2, true);
		await assertPromiseResolved(promise3, true);

		await resolveInitialize();
		await assertPromiseResolved(promise1, true);

		assertEquals(await promise1, {
			didShowAd: true,
			errorReason: null,
		});
		assertEquals(await promise2, {
			didShowAd: false,
			errorReason: "already-playing",
		});
		assertEquals(await promise3, {
			didShowAd: false,
			errorReason: "already-playing",
		});
	},
});

Deno.test({
	name: "Results in an 'already-playing' error when an ad is already playing",
	async fn() {
		let resolveFullScreen = () => {};
		let resolveRewarded = () => {};
		/** @type {import("../../src/AdLad.js").AdLadPlugin} */
		const plugin = {
			name: "plugin",
			async showFullScreenAd() {
				/** @type {Promise<void>} */
				const promise = new Promise((resolve) => resolveFullScreen = resolve);
				await promise;
				return {
					didShowAd: true,
					errorReason: null,
				};
			},
			async showRewardedAd() {
				/** @type {Promise<void>} */
				const promise = new Promise((resolve) => resolveRewarded = resolve);
				await promise;
				return {
					didShowAd: true,
					errorReason: null,
				};
			},
		};

		const adLad = new AdLad([plugin]);
		let showPromise;

		// Check if it results in 'already-playing' when showing a full screen ad
		showPromise = adLad.showFullScreenAd();
		// We need to wait because the plugin hook is not called immediately.
		await waitForMicrotasks();

		assertEquals(await adLad.showFullScreenAd(), {
			didShowAd: false,
			errorReason: "already-playing",
		});
		assertEquals(await adLad.showRewardedAd(), {
			didShowAd: false,
			errorReason: "already-playing",
		});
		resolveFullScreen();
		await showPromise;

		// Check if it works again when called after resolving
		showPromise = adLad.showFullScreenAd();
		// We need to wait because the plugin hook is not called immediately.
		await waitForMicrotasks();

		resolveFullScreen();
		await showPromise;

		showPromise = adLad.showRewardedAd();
		await waitForMicrotasks();
		resolveRewarded();
		await showPromise;

		// Check if it results in 'already-playing' when showing a rewarded ad
		showPromise = adLad.showRewardedAd();
		await waitForMicrotasks();
		assertEquals(await adLad.showFullScreenAd(), {
			didShowAd: false,
			errorReason: "already-playing",
		});
		assertEquals(await adLad.showRewardedAd(), {
			didShowAd: false,
			errorReason: "already-playing",
		});
		resolveRewarded();
		await showPromise;

		// Check if it works again when called after resolving
		showPromise = adLad.showFullScreenAd();
		await waitForMicrotasks();
		resolveFullScreen();
		await showPromise;

		showPromise = adLad.showRewardedAd();
		await waitForMicrotasks();
		resolveRewarded();
		await showPromise;
	},
});

Deno.test({
	name: "Results in 'already-playing' when already playing even though it's not implemented",
	async fn() {
		let resolveFullScreen = () => {};
		/** @type {import("../../src/AdLad.js").AdLadPlugin} */
		const plugin = {
			name: "plugin",
			async showFullScreenAd() {
				/** @type {Promise<void>} */
				const promise = new Promise((resolve) => resolveFullScreen = resolve);
				await promise;
				return {
					didShowAd: true,
					errorReason: null,
				};
			},
		};

		const adLad = new AdLad([plugin]);
		let showPromise;

		// Check if it results in 'already-playing' when showing a full screen ad
		showPromise = adLad.showFullScreenAd();
		// We need to wait because the plugin hook is not called immediately.
		await waitForMicrotasks();
		assertEquals(await adLad.showFullScreenAd(), {
			didShowAd: false,
			errorReason: "already-playing",
		});
		assertEquals(await adLad.showRewardedAd(), {
			didShowAd: false,
			errorReason: "already-playing",
		});
		resolveFullScreen();
		await showPromise;

		// Check if it works again when called after resolving
		showPromise = adLad.showFullScreenAd();
		await waitForMicrotasks();
		resolveFullScreen();
		await showPromise;

		await adLad.showRewardedAd();
	},
});

Deno.test({
	name: "Doesn't throw when calling multiple times while not implemented",
	async fn() {
		/** @type {import("../../src/AdLad.js").AdLadPlugin} */
		const plugin = {
			name: "plugin",
		};

		const adLad = new AdLad([plugin]);

		await adLad.showFullScreenAd();
		await adLad.showRewardedAd();
		await adLad.showFullScreenAd();
		await adLad.showRewardedAd();
		await adLad.showFullScreenAd();
		await adLad.showRewardedAd();
	},
});

Deno.test({
	name: "Doesn't throw when plugin implementation fails",
	async fn() {
		const consoleErrorSpy = stub(console, "error", () => {});

		try {
			const error = new Error("oh no");
			/** @type {import("../../src/AdLad.js").AdLadPlugin} */
			const plugin = {
				name: "plugin-name",
				showFullScreenAd() {
					throw error;
				},
			};

			const adLad = new AdLad([plugin]);

			const unknownResults = [];
			const notSupportedResults = [];
			unknownResults.push(await adLad.showFullScreenAd());
			notSupportedResults.push(await adLad.showRewardedAd());
			unknownResults.push(await adLad.showFullScreenAd());
			notSupportedResults.push(await adLad.showRewardedAd());
			unknownResults.push(await adLad.showFullScreenAd());
			notSupportedResults.push(await adLad.showRewardedAd());

			for (const result of unknownResults) {
				assertEquals(result, {
					didShowAd: false,
					errorReason: "unknown",
				});
			}
			for (const result of notSupportedResults) {
				assertEquals(result, {
					didShowAd: false,
					errorReason: "not-supported",
				});
			}

			assertSpyCalls(consoleErrorSpy, 3);
			assertSpyCall(consoleErrorSpy, 0, {
				args: [
					'An error occurred while trying to display an ad from the "plugin-name" plugin:',
					error,
				],
			});
		} finally {
			consoleErrorSpy.restore();
		}
	},
});

Deno.test({
	name: "Fires a second time even when setting the gameplaystart state fails",
	async fn() {
		const consoleErrorSpy = stub(console, "error");

		try {
			const error = new Error("oh no");
			/** @type {import("../../src/AdLad.js").AdLadPlugin} */
			const plugin = {
				name: "plugin-name",
				async showFullScreenAd() {
					return {
						didShowAd: true,
						errorReason: null,
					};
				},
				gameplayStart() {
					throw error;
				},
			};

			const adLad = new AdLad([plugin]);

			adLad.gameplayStart();

			const result1 = await adLad.showFullScreenAd();
			assertEquals(result1, {
				didShowAd: true,
				errorReason: null,
			});

			const result2 = await adLad.showFullScreenAd();
			assertEquals(result2, {
				didShowAd: true,
				errorReason: null,
			});
		} finally {
			consoleErrorSpy.restore();
		}
	},
});
