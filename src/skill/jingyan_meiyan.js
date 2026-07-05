import { lib, game, get, ui } from "noname";
const JINGYAN_DEBUG = true;

function jingyanCardText(card) {
	if (!card) return "（无）";
	return get.translation(card) || get.name(card, false) || String(card);
}

function jingyanCardsText(cards) {
	if (!cards?.length) return "（空）";
	return cards.map(jingyanCardText).join("、");
}

function jingyanLog(player, step, message) {
	if (!JINGYAN_DEBUG || !player?.isIn?.()) return;
	game.log(player, `【惊颜调试${step}】${message}`);
}

function dedupeCards(cards) {
	const seen = new Set();
	return cards.filter((card) => {
		if (!card) return false;
		const key = card.cardid || card;
		if (seen.has(key)) return false;
		seen.add(key);
		return get.position(card, true) !== undefined;
	});
}

function neverInOwnerHeThisTurn(card, owner) {
	let seen = false;
	game.checkGlobalHistory("cardMove", (evt) => {
		if (evt.name !== "lose" || evt.player !== owner) return;
		if (evt.hs?.includes(card) || evt.es?.includes(card)) seen = true;
	});
	return !seen;
}

function collectDiscardCardsFromLose(event) {
	if (event.position !== ui.discardPile && event.position !== "d") {
		return [];
	}
	const raw = event.cards?.slice() || event.getd?.() || [];
	return raw.filter((c) => get.position(c, true) === "d");
}

function collectDiscardCardsFromEvent(event) {
	const cards = [];
	const addCard = (card) => {
		if (card && get.position(card, true) === "d" && !cards.includes(card)) {
			cards.push(card);
		}
	};
	if (typeof event.getd === "function") {
		const dCards = event.getd();
		if (Array.isArray(dCards)) {
			dCards.forEach(addCard);
		}
	}
	if (cards.length) {
		return cards;
	}
	if (typeof event.getl === "function") {
		for (const current of game.filterPlayer()) {
			const lost = event.getl(current);
			for (const key of ["cards2", "cards", "hs", "es", "js"]) {
				if (Array.isArray(lost?.[key])) {
					lost[key].forEach(addCard);
				}
			}
		}
	}
	for (const key of ["cards2", "cards"]) {
		if (Array.isArray(event[key])) {
			event[key].forEach(addCard);
		}
	}
	return cards;
}

function getCardsEnteringDiscard(event) {
	let cards = [];
	if (event.name === "cardsDiscard") {
		cards = (typeof event.getd === "function" ? event.getd() : event.cards)?.slice() || [];
		if (typeof cards.filterInD === "function") {
			cards = cards.filterInD("d");
		} else {
			cards = cards.filter((c) => get.position(c, true) === "d");
		}
		if (!cards.length) {
			cards = collectDiscardCardsFromEvent(event);
		}
	} else if (event.name === "lose") {
		cards = collectDiscardCardsFromLose(event);
		if (!cards.length) {
			cards = collectDiscardCardsFromEvent(event);
		}
	} else if (event.name === "loseAsync") {
		if (typeof event.getd === "function") {
			cards = event.getd().filter((c) => get.position(c, true) === "d");
		}
		if (!cards.length) {
			game.checkGlobalHistory("cardMove", (evt) => {
				if (evt.name === "lose" && evt.parent === event && evt.position === ui.discardPile) {
					cards.addArray(collectDiscardCardsFromLose(evt));
				}
			});
		}
		if (!cards.length) {
			cards = collectDiscardCardsFromEvent(event);
		}
	} else if (typeof event.getd === "function") {
		cards = event.getd().filter((c) => get.position(c, true) === "d");
	}
	if (!cards.length) {
		cards = collectDiscardCardsFromEvent(event);
	}
	return dedupeCards(cards);
}

function getFieldSuitCount() {
	return game
		.filterPlayer()
		.map((p) => p.getCards("ej").map((c) => get.suit(c)))
		.flat()
		.unique().length;
}

function getUniqueSuits(cards, who) {
	return cards
		.map((c) => get.suit(c, who))
		.filter((s) => lib.suit.includes(s))
		.unique();
}

function isJingyanCountModeSingle(player) {
	return !!player.storage.qunfang_jingyan_mode_count !== !!player.storage.qunfang_jingyan_swap_count;
}

function isJingyanDestModeHand(player) {
	return !!player.storage.qunfang_jingyan_mode_dest !== !!player.storage.qunfang_jingyan_swap_dest;
}

function matchesJingyanCount(cards, player) {
	const single = isJingyanCountModeSingle(player);
	return single ? cards.length === 1 : cards.length >= 2;
}

function getCardsEnteringHand(event) {
	const cards = [];
	if (typeof event.getg !== "function") return cards;
	for (const target of game.filterPlayer()) {
		const gained = event.getg(target);
		if (gained?.length) cards.addArray(gained);
	}
	return dedupeCards(cards.filter((c) => get.position(c, true) === "h"));
}

function filterJingyanBatch(cards, player, debug = false) {
	if (!cards.length) {
		if (debug) jingyanLog(player, "E", "原始牌批为空，终止");
		return [];
	}
	if (!matchesJingyanCount(cards, player)) {
		if (debug) {
			jingyanLog(
				player,
				"E",
				`数量不符：当前模式=${isJingyanCountModeSingle(player) ? "一张" : "多"}，原始=${cards.length}张（${jingyanCardsText(cards)}）`,
			);
		}
		return [];
	}
	const passed = [];
	const rejected = [];
	for (const card of cards) {
		if (neverInOwnerHeThisTurn(card, player)) {
			passed.push(card);
		} else {
			rejected.push(card);
		}
	}
	if (debug) {
		jingyanLog(player, "F", `天予过滤通过=${passed.length}张（${jingyanCardsText(passed)}）`);
		if (rejected.length) {
			jingyanLog(player, "F", `天予过滤排除=${rejected.length}张（${jingyanCardsText(rejected)}）`);
		}
		if (!passed.length) {
			jingyanLog(player, "F", "全部牌本回合均曾处于你的手牌/装备区");
		} else if (!matchesJingyanCount(passed, player)) {
			jingyanLog(
				player,
				"F",
				`过滤后数量不符：通过=${passed.length}张，需要=${isJingyanCountModeSingle(player) ? "1" : "≥2"}张`,
			);
		}
	}
	if (!passed.length || !matchesJingyanCount(passed, player)) return [];
	return passed;
}

function traceJingyanEvent(event, player, triggerName) {
	try {
		jingyanLog(player, "A", `触发=${triggerName || "unknown"}；event.name=${event.name}；event.type=${event.type || "无"}`);
		jingyanLog(
			player,
			"B",
			`当前轴：数量=${isJingyanCountModeSingle(player) ? "一张" : "多"}；去向=${isJingyanDestModeHand(player) ? "手牌区" : "弃牌堆"}`,
		);
		const toHand = isJingyanDestModeHand(player);
		const raw = toHand ? getCardsEnteringHand(event) : getCardsEnteringDiscard(event);
		jingyanLog(player, "C", `${toHand ? "进手牌" : "进弃牌堆"}原始=${raw.length}张（${jingyanCardsText(raw)}）`);
		if (!toHand && event.name === "lose") {
			jingyanLog(
				player,
				"C1",
				`lose详情：player=${get.translation(event.player)}；position=${event.position === ui.discardPile ? "discardPile" : event.position}；cards=${event.cards?.length || 0}；getlx=${event.getlx}`,
			);
		}
		const batch = filterJingyanBatch(raw, player, true);
		jingyanLog(player, "G", `最终批次=${batch.length}张（${jingyanCardsText(batch)}）`);
		const hand = player.countCards("h");
		const hasOther = game.hasPlayer((t) => t !== player && t.isIn());
		jingyanLog(player, "H", `手牌=${hand}；存在其他角色=${hasOther ? "是" : "否"}`);
		if (!batch.length) {
			jingyanLog(player, "I", "结论：批次为空，主技能 filter 不通过");
		} else if (!hand) {
			jingyanLog(player, "I", "结论：批次有效但无手牌，主技能 filter 不通过");
		} else if (!hasOther) {
			jingyanLog(player, "I", "结论：批次有效但无其他角色，主技能 filter 不通过");
		} else {
			jingyanLog(player, "I", "结论：主技能 filter 应通过，等待弹窗");
		}
	} catch (error) {
		jingyanLog(player, "ERR", `${error?.message || error}`);
	}
}

function getJingyanBatch(event, player) {
	if (!player?.isIn?.()) return [];
	const toHand = isJingyanDestModeHand(player);
	const raw = toHand ? getCardsEnteringHand(event) : getCardsEnteringDiscard(event);
	return filterJingyanBatch(raw, player);
}

function isJingyanResolving(player) {
	return !!player.storage.qunfang_jingyan_resolving;
}

function getJingyanGiveableCards(player, suits) {
	if (!player?.isIn?.() || !Array.isArray(suits) || !suits.length) return [];
	return player.getCards("h", (card) => suits.includes(get.suit(card, player)));
}

function getMeiyanGainedCards(event, player) {
	if (typeof event.getg !== "function") return [];
	return dedupeCards(event.getg(player) || []);
}

const MEIYAN_EQUIP_SLOTS = [
	["equip1", "武器栏"],
	["equip2", "防具栏"],
	["equip3", "防御坐骑栏"],
	["equip4", "进攻坐骑栏"],
	["equip5", "宝物栏"],
];

function getMeiyanEnabledSlots(target) {
	return MEIYAN_EQUIP_SLOTS.filter(([slot]) => !target.hasDisabledSlot(slot));
}

function getMeiyanEquipCardsForSlot(player, slot) {
	return player.getCards("he", (card) => get.subtypes(card).includes(slot));
}

function getMeiyanGreaterCardsForSlot(player, slot) {
	return player.getCards("he", (card) => get.type(card, player) !== "equip" || get.subtypes(card).includes(slot));
}

function getMeiyanPlaceableSlots(target) {
	return getMeiyanEnabledSlots(target).filter(([slot]) => getMeiyanGreaterCardsForSlot(get.player?.() || target, slot).length > 0);
}

function ensureMeiyanVirtualCard(type) {
	if (!lib.card[`qunfang_meiyan_${type}`]) {
		lib.translate[`qunfang_meiyan_${type}`] = "媄嬿";
		lib.translate[`qunfang_meiyan_${type}_info`] = `原本是一张${get.translation(type)}牌。`;
		lib.card[`qunfang_meiyan_${type}`] = {
			fullskin: true,
			type,
			originalType: type,
			ai: { basic: { equipValue: 2 } },
			cardPrompt(card) {
				let str = `原本是一张${get.translation(this.originalType)}牌。`;
				const subtypes = get.subtypes(card);
				if (subtypes?.length) {
					str = `${str.slice(0, -1)}，被置入了${subtypes.map((i) => `${get.translation(i)}栏`).join("、")}。`;
				}
				return str;
			},
			async onLose(event) {
				event.cards.forEach((card) => {
					card.fix();
					ui.discardPile.appendChild(card);
					game.log(card, "被置入了弃牌堆");
				});
				if (event.getParent(2).name === "gain") {
					const remove = event.getParent(2).cards.filter((card) => card[card.cardSymbol] === event.card);
					event.getParent(2).cards.removeArray(remove);
				}
			},
		};
		game.finishCard(`qunfang_meiyan_${type}`);
	}
}

function createMeiyanVirtualEquip(card, slot) {
	const type = get.type2(card);
	ensureMeiyanVirtualCard(type);
	const cardx = get.autoViewAs({ name: `qunfang_meiyan_${type}` }, [card]);
	cardx.subtypes = [slot];
	return cardx;
}

async function gainJingyanBatch(player, cards) {
	const list = dedupeCards(cards);
	if (!list.length) return;
	const byOwner = new Map();
	for (const card of list) {
		const pos = get.position(card, true);
		if (pos === "d") {
			if (!byOwner.has("d")) byOwner.set("d", []);
			byOwner.get("d").push(card);
		} else {
			const owner = get.owner(card);
			if (owner?.isIn?.()) {
				if (!byOwner.has(owner)) byOwner.set(owner, []);
				byOwner.get(owner).push(card);
			}
		}
	}
	if (byOwner.has("d")) {
		await player.gain(byOwner.get("d"), "gain2");
	}
	for (const [key, batch] of byOwner) {
		if (key === "d") continue;
		const owner = key;
		const remaining = batch.filter((c) => get.owner(c) === owner);
		if (remaining.length) {
			await player.gain(remaining, owner, "giveAuto");
		}
	}
}

export const qunfangLibrarySkills = {
	qunfang_jingyan: {
		audio: 2,
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		init(player) {
			player.storage.qunfang_jingyan_mode_count ??= false;
			player.storage.qunfang_jingyan_mode_dest ??= false;
			player.storage.qunfang_jingyan_swap_count ??= false;
			player.storage.qunfang_jingyan_swap_dest ??= false;
		},
		intro: {
			content(storage, player) {
				const fn = lib.dynamicTranslate?.qunfang_jingyan;
				return fn ? fn(player) : lib.translate.qunfang_jingyan_info || "";
			},
		},
		group: ["qunfang_jingyan_trace"],
		trigger: {
			global: ["loseAfter", "loseAsyncAfter", "cardsDiscardAfter", "gainAfter"],
		},
		direct: true,
		filter(event, player) {
			if (isJingyanResolving(player)) {
				jingyanLog(player, "J0", "主技能filter未通过：当前处于惊颜结算隔离中");
				return false;
			}
			const batch = getJingyanBatch(event, player);
			if (!batch.length) return false;
			const suits = getUniqueSuits(batch, player);
			if (!suits.length) return false;
			if (!game.hasPlayer((t) => t !== player && t.isIn())) return false;
			if (!getJingyanGiveableCards(player, suits).length) {
				jingyanLog(player, "J0", `主技能filter未通过：没有可交出的同花色手牌（${jingyanCardsText(batch)}）`);
				return false;
			}
			event._qunfang_jingyan_batch = batch;
			event._qunfang_jingyan_suits = suits;
			jingyanLog(player, "J", `主技能filter通过，批次=${jingyanCardsText(batch)}`);
			return true;
		},
		async content(event, trigger, player) {
			jingyanLog(player, "K", "进入content");
			const batch = trigger._qunfang_jingyan_batch || getJingyanBatch(trigger, player);
			if (!batch.length) return;
			const suits = trigger._qunfang_jingyan_suits || getUniqueSuits(batch, player);
			if (!suits.length) return;
			jingyanLog(
				player,
				"K1",
				`本次发动条件：${isJingyanCountModeSingle(player) ? "一张" : "多张"}；${isJingyanDestModeHand(player) ? "一名角色的手牌区" : "弃牌堆"}`
			);
			const ok = await player
				.chooseBool(get.prompt("qunfang_jingyan"), "是否发动【惊颜】？")
				.set("ai", () => {
					const suits = trigger._qunfang_jingyan_suits;
					if (!suits?.length) return 0;
					const giveable = player.getCards("h", card => suits.includes(get.suit(card, player)));
					if (!giveable.length) return 0;
					const minValue = Math.min(...giveable.map(card => get.value(card, player)));
					if (minValue <= 4) return 1;
					const hasAlly = game.hasPlayer(t => t !== player && t.isIn() && get.attitude(player, t) > 0);
					return hasAlly ? 0.5 : 0.2;
				})
				.forResult();
			if (!ok?.bool) return;
			player.storage.qunfang_jingyan_mode_count = !player.storage.qunfang_jingyan_mode_count;
			player.storage.qunfang_jingyan_mode_dest = !player.storage.qunfang_jingyan_mode_dest;
			player.storage.qunfang_jingyan_resolving = true;
			try {
				const targetResult = await player
					.chooseTarget("惊颜：选择一名其他角色", true, (card, p, t) => t !== p && t.isIn())
					.set("ai", (t) => get.attitude(get.player(), t))
					.forResult();
				if (!targetResult?.bool || !targetResult.targets?.length) return;
				const target = targetResult.targets[0];
				if (!getJingyanGiveableCards(player, suits).length) return;
				const giveResult = await player
					.chooseCard(
						get.prompt("qunfang_jingyan", target),
						"将与这些牌相同花色的手牌交给该角色",
						"h",
						[1, Infinity],
						(card) => suits.includes(get.suit(card, player))
					)
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
				if (!giveResult?.bool || !giveResult.cards?.length) return;
				player.logSkill("qunfang_jingyan", target);
				await player.give(giveResult.cards, target);
				await gainJingyanBatch(player, batch);
				const exchange = await player
					.chooseBool("惊颜：是否交换描述中一组①和②的位置？")
					.set("ai", () => true)
					.forResult();
				if (!exchange?.bool) return;
				const choice = await player
					.chooseControl(["交换「多/一张」", "交换「弃牌堆/手牌区」"])
					.set("prompt", "惊颜：请选择要交换的一组①和②")
					.set("ai", () => "交换「多/一张」")
					.forResultControl();
				if (choice === "交换「多/一张」") {
					player.storage.qunfang_jingyan_swap_count = !player.storage.qunfang_jingyan_swap_count;
				} else if (choice === "交换「弃牌堆/手牌区」") {
					player.storage.qunfang_jingyan_swap_dest = !player.storage.qunfang_jingyan_swap_dest;
				}
			} finally {
				delete player.storage.qunfang_jingyan_resolving;
				player.markSkill("qunfang_jingyan");
			}
		},
		subSkill: {
			trace: {
				charlotte: true,
				trigger: {
					global: ["loseAfter", "loseAsyncAfter", "cardsDiscardAfter", "gainAfter"],
				},
				forced: true,
				popup: false,
				silent: true,
				filter(event, player, name) {
					if (!JINGYAN_DEBUG || !player.hasSkill("qunfang_jingyan", null, null, false)) {
						return false;
					}
					if (name === "cardsDiscardAfter" && event.getParent?.()?.name !== "orderingDiscard" && !event.cards?.filterInD?.("d")?.length) {
						// 仍记录，便于排查非 ordering 路径
					}
					return true;
				},
				content(event, trigger, player) {
					traceJingyanEvent(trigger, player, event.triggername || trigger.name);
				},
			},
		},
	},
	qunfang_meiyan: {
		audio: 2,
		usable: 1,
		trigger: {
			player: ["gainAfter", "loseAsyncAfter"],
		},
		direct: true,
		filter(event, player) {
			const cards = getMeiyanGainedCards(event, player);
			if (!cards.length) return false;
			const gainSuits = getUniqueSuits(cards, player);
			if (!gainSuits.length) return false;
			const fieldSuits = getFieldSuitCount();
			const canEqual = gainSuits.length === fieldSuits && game.hasPlayer((target) => target.isIn() && target.countCards("he") > 0);
			const canGreater =
				gainSuits.length > fieldSuits &&
				game.hasPlayer((target) => {
					if (!target.isIn()) return false;
					return getMeiyanEnabledSlots(target).length > 0;
				});
			const canLess = gainSuits.length < fieldSuits && game.hasPlayer((target) => target.isIn() && target.countCards("e") > 0);
			if (!canEqual && !canGreater && !canLess) return false;
			event._qunfang_meiyan_cards = cards;
			event._qunfang_meiyan_gainSuits = gainSuits;
			event._qunfang_meiyan_fieldSuits = fieldSuits;
			event._qunfang_meiyan_modes = { canEqual, canGreater, canLess };
			return true;
		},
		async content(event, trigger, player) {
			const cards = trigger._qunfang_meiyan_cards || getMeiyanGainedCards(trigger, player);
			const gainSuits = trigger._qunfang_meiyan_gainSuits || getUniqueSuits(cards, player);
			const fieldSuits = trigger._qunfang_meiyan_fieldSuits ?? getFieldSuitCount();
			const modeInfo = trigger._qunfang_meiyan_modes || {};
			const canEqual =
				modeInfo.canEqual ??
				(gainSuits.length === fieldSuits && game.hasPlayer((target) => target.isIn() && target.countCards("he") > 0));
			const canGreater =
				modeInfo.canGreater ??
				(gainSuits.length > fieldSuits &&
					game.hasPlayer((target) => {
						if (!target.isIn()) return false;
						return getMeiyanEnabledSlots(target).length > 0;
					}));
			const canLess =
				modeInfo.canLess ?? (gainSuits.length < fieldSuits && game.hasPlayer((target) => target.isIn() && target.countCards("ej") > 0));
			if (!canEqual && !canGreater && !canLess) return;
			const ok = await player
				.chooseBool(get.prompt("qunfang_meiyan"), "是否发动【媄嬿】？")
				.set("ai", () => true)
				.forResult();
			if (!ok?.bool) return;
			let mode = "";
			if (canEqual && !canGreater && !canLess) {
				mode = "equal";
			} else if (!canEqual && canGreater && !canLess) {
				mode = "greater";
			} else if (!canEqual && !canGreater && canLess) {
				mode = "less";
			} else {
				const controls = [];
				if (canEqual) controls.push("等于");
				if (canGreater) controls.push("大于");
				if (canLess) controls.push("小于");
				const control = await player
					.chooseControl(controls)
					.set("prompt", "媄嬿：请选择要执行的分支")
					.set("ai", () => {
						if (controls.includes("大于")) return "大于";
						if (controls.includes("等于")) return "等于";
						return controls[0];
					})
					.forResultControl();
				if (control === "等于") mode = "equal";
				else if (control === "大于") mode = "greater";
				else if (control === "小于") mode = "less";
			}
			if (!mode) return;
			if (mode === "equal") {
				const targetResult = await player
					.chooseTarget("媄嬿：选择一名角色", true, (card, p, t) => t.isIn() && t.countCards("he") > 0)
					.set("ai", (t) => -get.attitude(get.player(), t))
					.forResult();
				if (!targetResult?.bool || !targetResult.targets?.length) return;
				const target = targetResult.targets[0];
				player.logSkill("qunfang_meiyan", target);
				const equipCount = target.countCards("e");
				let amount = 1;
				if (equipCount > 0) {
					const amountControl = await player
						.chooseControl(["一", String(equipCount)])
						.set("prompt", "媄嬿：请选择令其交给你的牌数")
						.set("ai", () => {
							const target = get.event().target;
							return get.attitude(get.player(), target) < 0 ? String(get.event().equipCount) : "一";
						})
						.set("target", target)
						.set("equipCount", equipCount)
						.forResultControl();
					amount = amountControl === String(equipCount) ? equipCount : 1;
				}
				const giveCardResult = await target
					.chooseCard(amount, "he", true, `媄嬿：请交给${get.translation(player)}${amount}张牌`)
					.set("ai", (card) => 6 - get.value(card))
					.forResult();
				const cardsToGive = giveCardResult?.cards || [];
				if (!cardsToGive.length) return;
				await target.give(cardsToGive, player);
			} else if (mode === "greater") {
				const targetResult = await player
					.chooseTarget(
						"媄嬿：选择一名角色",
						true,
						(card, p, t) => t.isIn() && getMeiyanEnabledSlots(t).length > 0
					)
					.set("ai", (t) => get.attitude(get.player(), t) + 0.5)
					.forResult();
				if (!targetResult?.bool || !targetResult.targets?.length) return;
				const target = targetResult.targets[0];
				player.logSkill("qunfang_meiyan", target);
				const slots = getMeiyanEnabledSlots(target);
				if (!slots.length) return;
				const slotControl = await player
					.chooseControl(
						slots.map((item) => item[1])
					)
					.set("prompt", "媄嬿：请选择要置入的装备栏")
					.set("ai", () => slots[0][1])
					.forResultControl();
				const slot = slots.find((item) => item[1] === slotControl)?.[0];
				if (!slot) return;
				const cardResult = await player
					.chooseCard(
						"媄嬿：选择一张置入该装备栏的牌",
						"he",
						1,
						(card) => get.type(card, player) !== "equip" || get.subtypes(card).includes(slot)
					)
					.set("ai", (card) => {
						if (get.type(card, player) === "equip") {
							return get.equipValue(card, target) - get.value(card, player);
						}
						return 5 - get.value(card, player);
					})
					.forResult();
				if (!cardResult?.bool || !cardResult.cards?.length) return;
				const chosenCard = cardResult.cards[0];
				if (get.position(chosenCard, true) === undefined) return;
				if (get.type(chosenCard, player) === "equip") {
					if (!target.canEquip(chosenCard, true)) return;
					await target.equip(chosenCard, true);
				} else {
					const virtualCard = createMeiyanVirtualEquip(chosenCard, slot);
					await target.equip(virtualCard, true);
				}
			} else if (mode === "less") {
				const targetResult = await player
					.chooseTarget("媄嬿：选择一名场上有牌的角色", true, (card, p, t) => t.isIn() && t.countCards("ej") > 0)
					.set("ai", (t) => -get.attitude(get.player(), t) * Math.max(1, t.countCards("ej")))
					.forResult();
				if (!targetResult?.bool || !targetResult.targets?.length) return;
				const target = targetResult.targets[0];
				player.logSkill("qunfang_meiyan", target);
				await player.gainPlayerCard(target, "ej", true);
			}
		},
	},
};
