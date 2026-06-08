/**
 * 蔡文姬技能
 */
import { lib, game, get, ui, _status } from "noname";
import { getXiaoyinModeLine } from "../translate/dynamicTranslate.js";

const XIAO_SKILL = "qunfang_xiaoyin_xiao";
const WAS_XIAO_KEY = "qunfang_xiaoyin_was_xiao";

function getXiaoIntroExtra(player) {
	const modeLine = getXiaoyinModeLine(player);
	const xiao = player.getExpansions(XIAO_SKILL);
	const suits = player.storage.qunfang_xiaoyin_discard_suits || [];
	const xiaoStr = xiao.length ? get.translation(xiao) : "（无）";
	const suitStr = suits.length ? suits.map((s) => get.translation(s)).join("、") : "（无）";
	return `${modeLine}<br>「萧」：${xiaoStr}<br>本回合弃牌堆花色：${suitStr}`;
}

function shouldCountXiaoyinDiscard(event) {
	if (!_status.currentPhase) {
		return false;
	}
	if (event.name === "cardsDiscard") {
		return event.getParent?.()?.name === "orderingDiscard" && (event.cards?.filterInD("d")?.length ?? 0) > 0;
	}
	return event.name === "lose" && event.position === ui.discardPile && (event.cards?.filterInD("d")?.length ?? 0) > 0;
}

function addTurnDiscardSuits(player, event) {
	if (!Array.isArray(player.storage.qunfang_xiaoyin_discard_suits)) {
		player.storage.qunfang_xiaoyin_discard_suits = [];
	}
	const suits = player.storage.qunfang_xiaoyin_discard_suits;
	if (!shouldCountXiaoyinDiscard(event)) {
		return suits;
	}
	const cards = event.cards.filterInD("d");
	const pushSuit = (card) => {
		const suit = get.suit(card, false);
		if (suit && !suits.includes(suit)) {
			suits.push(suit);
		}
	};
	cards.forEach(pushSuit);
	return suits;
}

function isNonVirtualDamageCard(event) {
	return event.card && event.cards?.length > 0 && get.tag(event.card, "damage");
}

function isEventAncestor(child, ancestor) {
	let evt = child;
	while (evt) {
		if (evt === ancestor) {
			return true;
		}
		evt = evt.parent;
	}
	return false;
}

function getUseCardPlacedCards(event) {
	if (!event.cards?.length) {
		return [];
	}
	const inZone = event.cards.filterInD("od");
	if (inZone.length) {
		return inZone;
	}
	return event.cards.filter((card) => {
		const pos = get.position(card, true);
		return pos === "d" || pos === "o";
	});
}

function getCardTrackIds(card) {
	const ids = [];
	const seen = new Set();
	for (const id of [card._cardid, card.cardid]) {
		if (id != null && id !== false && id !== -1 && !seen.has(id)) {
			seen.add(id);
			ids.push(id);
		}
	}
	return ids;
}

function hasBeenXiaoThisRound(player, card) {
	const entered = player.storage[WAS_XIAO_KEY] || [];
	const trackIds = getCardTrackIds(card);
	return trackIds.length > 0 && trackIds.some((id) => entered.includes(id));
}

function markWasXiao(player, card) {
	const list = (player.storage[WAS_XIAO_KEY] ??= []);
	for (const id of getCardTrackIds(card)) {
		if (!list.includes(id)) {
			list.push(id);
		}
	}
}

function getXiaoyinPlaceableCards(player, useCardEvent) {
	return getUseCardPlacedCards(useCardEvent).filter((card) => !hasBeenXiaoThisRound(player, card));
}

function cardCausedDamage(event, player) {
	if (player.hasHistory("sourceDamage", (evt) => evt.card == event.card)) {
		return true;
	}
	const test = (evt) => {
		if (evt.card == event.card) {
			return true;
		}
		if (isEventAncestor(evt, event)) {
			return true;
		}
		return evt.getParent("useCard") === event;
	};
	if (player.hasHistory("sourceDamage", test)) {
		return true;
	}
	return game.hasPlayer((p) => p.hasHistory("damage", test));
}

function getXiaoBySuit(player, suit) {
	return player.getExpansions(XIAO_SKILL).filter((card) => get.suit(card, player) === suit);
}

function canPing(player) {
	if (player.storage.qunfang_xiaoyin) {
		return false;
	}
	if (!player.storage.qunfang_xiaoyin_no_limit && player.hasSkill("qunfang_xiaoyin_used", null, null, false)) {
		return false;
	}
	return player.getExpansions(XIAO_SKILL).length > 0;
}

function xiaoToViewAs(xiaoCard, player) {
	return {
		name: get.name(xiaoCard, player),
		nature: get.nature(xiaoCard, player),
		isCard: true,
	};
}

function getPingXiaoOptions(player, requiredName) {
	if (!canPing(player)) {
		return [];
	}
	return player.getExpansions(XIAO_SKILL).filter((xiaoCard) => {
		const name = get.name(xiaoCard, player);
		if (!name) {
			return false;
		}
		if (requiredName && name !== requiredName) {
			return false;
		}
		return player.hasCard((card) => get.suit(card, player) !== get.suit(xiaoCard, player), "hes");
	});
}

export const qunfangCaiwenjiSkills = {
	qunfang_xiaoyin: {
		audio: 2,
		yunlvSkill: true,
		zhuanhuanji: true,
		categories: () => ["韵律技"],
		mark: true,
		marktext: "🎶",
		intro: {
			content(storage, player) {
				return getXiaoIntroExtra(player);
			},
		},
		onremove(player) {
			const cards = player.getExpansions(XIAO_SKILL);
			if (cards.length) {
				player.loseToDiscardpile(cards);
			}
		},
		enable: "chooseToUse",
		filter(event, player) {
			return getPingXiaoOptions(player).some((xiaoCard) => {
				const viewAs = get.autoViewAs(xiaoToViewAs(xiaoCard, player), "unsure");
				return event.filterCard(viewAs, player, event);
			});
		},
		hiddenCard(player, name) {
			return getPingXiaoOptions(player, name).length > 0;
		},
		onChooseToUse(event) {
			if (game.online || event.qunfang_xiaoyin_xiao) {
				return;
			}
			const player = event.player;
			const list = getPingXiaoOptions(player).filter((xiaoCard) => {
				const viewAs = get.autoViewAs(xiaoToViewAs(xiaoCard, player), "unsure");
				return event.filterCard(viewAs, player, event);
			});
			event.set("qunfang_xiaoyin_xiao", list);
		},
		chooseButton: {
			dialog(event, player) {
				const list = event.qunfang_xiaoyin_xiao?.length ? event.qunfang_xiaoyin_xiao : getPingXiaoOptions(player);
				return ui.create.dialog(get.prompt("qunfang_xiaoyin"), list);
			},
			check(button) {
				const player = get.player();
				const viewAs = get.autoViewAs(xiaoToViewAs(button.link, player), "unsure");
				return player.getUseValue(viewAs);
			},
			backup(links, player) {
				const xiaoCard = links[0];
				const viewAs = xiaoToViewAs(xiaoCard, player);
				player.storage.qunfang_xiaoyin_pending_suit = get.suit(xiaoCard, player);
				player.storage.qunfang_xiaoyin_pending_xiao = xiaoCard;
				return {
					audio: "qunfang_xiaoyin",
					filterCard(card, p) {
						const suit = p.storage.qunfang_xiaoyin_pending_suit;
						return suit && get.suit(card, p) !== suit;
					},
					selectCard: 1,
					position: "hes",
					viewAs,
					popname: true,
					async precontent(event, trigger, player) {
						const xiaoCard = player.storage.qunfang_xiaoyin_pending_xiao;
						delete player.storage.qunfang_xiaoyin_pending_xiao;
						delete player.storage.qunfang_xiaoyin_pending_suit;
						if (xiaoCard) {
							await player.loseToDiscardpile(xiaoCard);
							player.markSkill(XIAO_SKILL);
							player.markSkill("qunfang_xiaoyin");
						}
						player.logSkill("qunfang_xiaoyin");
					},
					async contentAfter(event, trigger, player) {
						if (!player.storage.qunfang_xiaoyin_no_limit) {
							player.addTempSkill("qunfang_xiaoyin_used", "phaseAfter");
						}
					},
				};
			},
			prompt(links) {
				const xiaoCard = links[0];
				const viewAs = xiaoToViewAs(xiaoCard);
				return `萧音：移去${get.translation(xiaoCard)}，将一张花色不同的牌当${get.translation(viewAs)}使用`;
			},
		},
		ai: {
			order: 6,
			save: true,
			respondShan: true,
			respondSha: true,
			skillTagFilter(player, tag, arg) {
				if (!canPing(player)) {
					return false;
				}
				if (arg === "respond" || tag === "respond") {
					return false;
				}
				if (tag === "respondShan") {
					return getPingXiaoOptions(player, "shan").length > 0;
				}
				if (tag === "respondSha") {
					return getPingXiaoOptions(player, "sha").length > 0;
				}
				if (tag === "save") {
					return getPingXiaoOptions(player, "tao").length > 0;
				}
			},
			result: {
				player: 1,
			},
		},
		group: [
			"qunfang_xiaoyin_place",
			"qunfang_xiaoyin_ze",
			"qunfang_xiaoyin_zhuanyun",
			"qunfang_xiaoyin_turn",
			"qunfang_xiaoyin_round",
			"qunfang_xiaoyin_xiao",
		],
		subSkill: {
			backup: {},
			used: {
				charlotte: true,
			},
			xiao: {
				charlotte: true,
				mark: true,
				marktext: "萧",
				intro: {
					content: "expansion",
					markcount: "expansion",
				},
				onremove(player, skill) {
					const cards = player.getExpansions(skill);
					if (cards.length) {
						player.loseToDiscardpile(cards);
					}
				},
			},
			place: {
				audio: "qunfang_xiaoyin",
				locked: false,
				trigger: { global: "useCardAfter" },
				filter(event, player) {
					return event.player?.isIn() && isNonVirtualDamageCard(event);
				},
				async cost(event, trigger, player) {
					if (!isNonVirtualDamageCard(trigger)) {
						return;
					}
					if (!player.storage.qunfang_xiaoyin_no_damage && !cardCausedDamage(trigger, player)) {
						return;
					}
					const cards = getXiaoyinPlaceableCards(player, trigger);
					if (!cards.length) {
						return;
					}
					const result = await player
						.chooseBool(get.prompt("qunfang_xiaoyin"), "是否将此牌置于武将牌上，称为「萧」？")
						.set("ai", () => {
							const card = get.event().card;
							return 6 - get.value(card);
						})
						.set("card", cards[0])
						.forResult();
					event.result = {
						bool: result?.bool,
						cost_data: cards,
					};
				},
				async content(event, trigger, player) {
					const cards = event.cost_data || getXiaoyinPlaceableCards(player, trigger);
					if (!cards?.length) {
						return;
					}
					player.logSkill("qunfang_xiaoyin");
					await player.addToExpansion(cards, "gain2").gaintag.add(XIAO_SKILL);
					for (const card of cards) {
						markWasXiao(player, card);
					}
					player.markSkill(XIAO_SKILL);
					player.markSkill("qunfang_xiaoyin");
				},
			},
			ze: {
				audio: "qunfang_xiaoyin",
				locked: false,
				trigger: { player: "useCardAfter" },
				filter(event, player) {
					if (!player.storage.qunfang_xiaoyin || !event.card) {
						return false;
					}
					if (!player.storage.qunfang_xiaoyin_no_limit && player.hasSkill("qunfang_xiaoyin_used", null, null, false)) {
						return false;
					}
					const suit = get.suit(event.card, player);
					return !!suit && getXiaoBySuit(player, suit).length > 0;
				},
				async cost(event, trigger, player) {
					const suit = get.suit(trigger.card, player);
					const cards = getXiaoBySuit(player, suit);
					if (!cards.length) {
						return;
					}
					const result = await player
						.chooseBool(
							get.prompt("qunfang_xiaoyin"),
							`是否获得${get.translation(cards)}？`
						)
						.set("ai", () => {
							const cards = get.event().cards;
							return cards.reduce((sum, card) => sum + get.value(card), 0);
						})
						.set("cards", cards)
						.forResult();
					event.result = {
						bool: result?.bool,
						cost_data: cards,
					};
				},
				async content(event, trigger, player) {
					const cards = event.cost_data;
					if (!cards?.length) {
						return;
					}
					player.logSkill("qunfang_xiaoyin");
					await player.gain(cards, "gain2");
					if (!player.storage.qunfang_xiaoyin_no_limit) {
						player.addTempSkill("qunfang_xiaoyin_used", "phaseAfter");
					}
					player.markSkill(XIAO_SKILL);
					player.markSkill("qunfang_xiaoyin");
				},
			},
			zhuanyun: {
				audio: "qunfang_xiaoyin",
				trigger: { global: ["loseAfter", "cardsDiscardAfter"] },
				forced: true,
				locked: false,
				popup: false,
				filter(event, player) {
					return !player.storage.qunfang_xiaoyin_zhuanyun_turn && shouldCountXiaoyinDiscard(event);
				},
				async content(event, trigger, player) {
					const suits = addTurnDiscardSuits(player, trigger);
					player.markSkill("qunfang_xiaoyin");
					if (suits.length < 4) {
						return;
					}
					player.storage.qunfang_xiaoyin_zhuanyun_turn = true;
					player.changeZhuanhuanji("qunfang_xiaoyin");
					if (player.hasSkill("qunfang_xiaoyin_used", null, null, false)) {
						player.removeSkill("qunfang_xiaoyin_used");
					}
					if (player.getStat("skill")?.qunfang_xiaoyin) {
						delete player.getStat("skill").qunfang_xiaoyin;
					}
					game.log(player, "转换了", "#g【萧音】", "的韵律");
					player.markSkill("qunfang_xiaoyin");
				},
			},
		},
	},
	qunfang_xiaoyin_turn: {
		charlotte: true,
		trigger: { global: "phaseAfter" },
		silent: true,
		filter(event, player) {
			return _status.currentPhase && event.player === _status.currentPhase;
		},
		content(event, trigger, player) {
			delete player.storage.qunfang_xiaoyin_zhuanyun_turn;
			delete player.storage.qunfang_xiaoyin_discard_suits;
			player.markSkill("qunfang_xiaoyin");
		},
	},
	qunfang_xiaoyin_round: {
		charlotte: true,
		trigger: { global: "roundStart" },
		silent: true,
		forced: true,
		popup: false,
		content(event, trigger, player) {
			delete player.storage.qunfang_xiaoyin_was_xiao;
		},
	},
	qunfang_xuansgui: {
		audio: 2,
		dutySkill: true,
		mark: true,
		intro: {
			content(storage, player) {
				const names = player.getStorage("qunfang_xuansgui_names") || [];
				const nameStr = names.length ? names.map((n) => get.translation(n)).join("、") : "（无）";
				return `已记录牌名：${nameStr}`;
			},
		},
		init(player) {
			player.storage.qunfang_xuansgui_names ??= [];
			player.storage.qunfang_xuansgui_done ??= false;
		},
		async checkMission(player, trigger) {
			if (player.storage.qunfang_xuansgui_done) {
				return;
			}
			const X = game.countPlayer((p) => p.isAlive());
			const names = player.getStorage("qunfang_xuansgui_names") || [];
			if (names.length <= X) {
				return;
			}
			const damage = names.filter((n) => get.tag({ name: n, isCard: true }, "damage"));
			const nonDamage = names.filter((n) => !get.tag({ name: n, isCard: true }, "damage"));
			const evt = trigger || get.event();
			if (damage.length >= nonDamage.length) {
				await game
					.createTrigger("qunfang_xuansguiAchieve", "qunfang_xuansgui_achieve", player, evt)
					.forResult();
			} else {
				await game
					.createTrigger("qunfang_xuansguiFail", "qunfang_xuansgui_fail", player, evt)
					.forResult();
			}
		},
		group: [
			"qunfang_xuansgui_record",
			"qunfang_xuansgui_die",
			"qunfang_xuansgui_achieve",
			"qunfang_xuansgui_fail",
		],
		subSkill: {
			achieve: {
				audio: "qunfang_xuansgui",
				trigger: { player: "qunfang_xuansguiAchieve" },
				forced: true,
				skillAnimation: true,
				animationColor: "water",
				filter(event, player) {
					if (player.storage.qunfang_xuansgui_done) {
						return false;
					}
					const X = game.countPlayer((p) => p.isAlive());
					const names = player.getStorage("qunfang_xuansgui_names") || [];
					if (names.length <= X) {
						return false;
					}
					const damage = names.filter((n) => get.tag({ name: n, isCard: true }, "damage"));
					const nonDamage = names.filter((n) => !get.tag({ name: n, isCard: true }, "damage"));
					return damage.length >= nonDamage.length;
				},
				async content(event, trigger, player) {
					player.storage.qunfang_xuansgui_done = true;
					player.awakenSkill("qunfang_xuansgui");
					game.log(player, "成功完成使命");
					if (get.info("mozhi")) {
						await player.addSkills("mozhi");
					}
					player.storage.qunfang_xiaoyin_no_damage = true;
					player.markSkill("qunfang_xiaoyin");
				},
			},
			fail: {
				audio: "qunfang_xuansgui",
				trigger: { player: "qunfang_xuansguiFail" },
				forced: true,
				skillAnimation: true,
				animationColor: "gray",
				filter(event, player) {
					if (player.storage.qunfang_xuansgui_done) {
						return false;
					}
					const X = game.countPlayer((p) => p.isAlive());
					const names = player.getStorage("qunfang_xuansgui_names") || [];
					if (names.length <= X) {
						return false;
					}
					const damage = names.filter((n) => get.tag({ name: n, isCard: true }, "damage"));
					const nonDamage = names.filter((n) => !get.tag({ name: n, isCard: true }, "damage"));
					return damage.length < nonDamage.length;
				},
				async content(event, trigger, player) {
					player.storage.qunfang_xuansgui_done = true;
					player.awakenSkill("qunfang_xuansgui");
					game.log(player, "使命失败");
					if (get.info("beige")) {
						await player.addSkills("beige");
					}
					player.storage.qunfang_xiaoyin_no_limit = true;
					player.markSkill("qunfang_xiaoyin");
				},
			},
		},
	},
	qunfang_xuansgui_die: {
		audio: "qunfang_xuansgui",
		trigger: { global: "dieAfter" },
		forced: true,
		popup: false,
		filter(event, player) {
			if (player.storage.qunfang_xuansgui_done) {
				return false;
			}
			const names = player.getStorage("qunfang_xuansgui_names") || [];
			return names.length > game.countPlayer((p) => p.isAlive());
		},
		async content(event, trigger, player) {
			await lib.skill.qunfang_xuansgui.checkMission(player, trigger);
		},
	},
	qunfang_xuansgui_record: {
		audio: "qunfang_xuansgui",
		trigger: { player: ["gainAfter", "useCardAfter"] },
		forced: true,
		popup: false,
		filter(event, player) {
			if (player.storage.qunfang_xuansgui_done) {
				return false;
			}
			if (event.getParent("phaseDraw", true)) {
				return false;
			}
			if (event.name === "useCard") {
				return get.is.convertedCard(event.card) && !!get.name(event.card, player);
			}
			return event.cards?.length > 0;
		},
		async content(event, trigger, player) {
			const namesToAdd = [];
			if (trigger.name === "useCard") {
				const name = get.name(trigger.card, player);
				if (name) {
					namesToAdd.push(name);
				}
			} else {
				for (const card of trigger.cards) {
					const name = get.name(card, player);
					if (name) {
						namesToAdd.push(name);
					}
				}
			}
			let added = false;
			for (const name of namesToAdd) {
				const names = player.getStorage("qunfang_xuansgui_names") || [];
				if (!names.includes(name)) {
					player.markAuto("qunfang_xuansgui_names", [name]);
					added = true;
				}
			}
			if (added) {
				player.markSkill("qunfang_xuansgui");
				await lib.skill.qunfang_xuansgui.checkMission(player, trigger);
			}
		},
	},
};
