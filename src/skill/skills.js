/**
 * 技能本体
 */
import { lib, game, get, ui } from "noname";
import { qunfangZhaoxiangSkills } from "./zhaoxiang.js";
import { qunfangXiahoushiSkills } from "./xiahoushi.js";
import { qunfangCaiwenjiSkills } from "./caiwenji.js";

function getYinjiCard(player) {
	return player.storage.qunfang_yinji_card || "qunfang_yiyi";
}

/** 从 lose 事件向上查找对应的虚拟 useCard */
function findYinjiVirtualUse(loseEvt, user, cardName) {
	let parent = loseEvt.relatedEvent || loseEvt.getParent(1, true);
	while (parent) {
		if (
			parent.name === "useCard" &&
			parent.skill === "qunfang_yinji" &&
			parent.card &&
			get.name(parent.card, user) === cardName
		) {
			return parent;
		}
		if (typeof parent.getParent !== "function") {
			break;
		}
		parent = parent.relatedEvent || parent.getParent(1, true);
	}
	return null;
}

/** 收集单次 lose 事件中该角色失去的牌（手牌/装备/判定/弃置等） */
function collectYinjiLostCards(evt, user) {
	const l = evt.getl?.(user);
	if (!l) {
		return [];
	}
	const cards = [];
	for (const key of ["cards2", "hs", "es", "js"]) {
		if (l[key]?.length) {
			cards.addArray(l[key]);
		}
	}
	return cards;
}

function dedupeCards(cards) {
	const seen = new Set();
	return cards.filter((card) => {
		if (!card?.cardid || seen.has(card.cardid)) {
			return false;
		}
		seen.add(card.cardid);
		return get.position(card, true) !== undefined;
	});
}

/** 收集本次虚拟 useCard 结算过程中失去的牌 */
function collectLoseCardsFromVirtual(user, fromIndex, cardName) {
	const cards = [];
	const history = user.getHistory("lose");
	for (let i = fromIndex; i < history.length; i++) {
		const evt = history[i];
		if (!findYinjiVirtualUse(evt, user, cardName)) {
			continue;
		}
		const list = collectYinjiLostCards(evt, user);
		if (list.length) {
			cards.addArray(list);
		}
	}
	return dedupeCards(cards);
}

function getCardTypes(cards, who) {
	const types = [];
	for (const card of cards) {
		const t = get.type(card, who, false);
		if (t && !types.includes(t)) {
			types.push(t);
		}
	}
	return types;
}

function intersectTypes(cardsA, cardsB, playerA, playerB) {
	const tb = getCardTypes(cardsB, playerB);
	return getCardTypes(cardsA, playerA).filter((t) => tb.includes(t));
}

function canYinjiFollowUse(actor, opponent, card, types) {
	if (!card || get.position(card, true) === undefined) {
		return false;
	}
	if (!types.includes(get.type(card, actor, false))) {
		return false;
	}
	if (get.type(card, actor, false) === "equip" && opponent.canEquip(card, true)) {
		return true;
	}
	const owner = get.owner(card);
	if (owner === actor) {
		if (actor.canUse(card, opponent, false)) {
			return true;
		}
		const info = get.info(card);
		return !!(info?.notarget && lib.filter.cardEnabled(card, actor));
	}
	const pos = get.position(card, true);
	if (pos === "d" || pos === "o") {
		if (actor.canUse(card, opponent, false)) {
			return true;
		}
		const info = get.info(card);
		return !!(info?.notarget && lib.filter.cardEnabled(card, actor));
	}
	if (owner?.isIn?.() && owner !== opponent) {
		const vcard = get.autoViewAs(card);
		return actor.canUse(vcard, opponent, false);
	}
	return false;
}

async function yinjiExecuteLostUse(actor, opponent, card) {
	const type = get.type(card, actor, false);
	if (type === "equip" && opponent.canEquip(card, true)) {
		await equipYinjiLostOn(opponent, card, actor);
		return;
	}
	const owner = get.owner(card);
	const pos = get.position(card, true);
	if (owner === actor) {
		await actor
			.chooseUseTarget(card, true, false, `姻计：对${get.translation(opponent)}使用${get.translation(card)}`)
			.set("filterTarget", (c, p, t) => t === opponent)
			.set("logSkill", "qunfang_yinji");
		return;
	}
	if (pos === "d" || pos === "o") {
		const vcard = get.autoViewAs(card);
		await actor
			.chooseUseTarget(vcard, true, false, `姻计：对${get.translation(opponent)}使用${get.translation(card)}`)
			.set("filterTarget", (c, p, t) => t === opponent)
			.set("logSkill", "qunfang_yinji");
		return;
	}
	if (owner?.isIn?.() && owner !== actor) {
		await actor.gain(card, owner, "giveAuto");
		if (get.owner(card) === actor) {
			await yinjiExecuteLostUse(actor, opponent, card);
		}
	}
}

function isOnEquipZone(who, card) {
	return who.getCards("e").includes(card);
}

async function equipYinjiLostOn(opponent, card, actor) {
	if (isOnEquipZone(opponent, card) || !opponent.canEquip(card, true)) {
		return;
	}
	const owner = get.owner(card);
	if (owner && owner !== opponent && get.position(card, true) === "e") {
		await owner.lose(card, ui.special);
	}
	if (isOnEquipZone(opponent, card) || !opponent.canEquip(card, true)) {
		return;
	}
	await opponent.equip(card);
	game.log(actor, "令", opponent, "装备了", card);
}

async function virtualYinjiCard(user, other, cardName) {
	if (!get.info(cardName)) {
		return false;
	}
	const vcard = get.autoViewAs({ name: cardName, isCard: true });
	if (cardName === "qunfang_yiyi") {
		if (!lib.filter.targetEnabled(vcard, user, user)) {
			return false;
		}
		await user.useCard(vcard, user, false, "qunfang_yinji");
		return true;
	}
	if (!other?.isIn?.() || !user.canUse(vcard, other, false)) {
		return false;
	}
	const useBefore = user.getHistory(
		"useCard",
		(evt) => evt.skill === "qunfang_yinji" && evt.card && get.name(evt.card, user) === cardName,
	).length;
	await user
		.chooseUseTarget(vcard, other, true, false, `姻计：视为使用一张【${get.translation(cardName)}】`)
		.set("filterTarget", (c, p, t) => t === other && lib.filter.targetEnabled(c, p, t))
		.set("logSkill", "qunfang_yinji");
	const useAfter = user.getHistory(
		"useCard",
		(evt) => evt.skill === "qunfang_yinji" && evt.card && get.name(evt.card, user) === cardName,
	).length;
	return useAfter > useBefore;
}

async function useLostCard(actor, opponent, opponentLost, types, cardName) {
	if (cardName === "qunfang_toulianghuanzhu" && types.includes("equip")) {
		const pool = opponentLost.filter((card) => {
			if (get.type(card, actor, false) !== "equip") {
				return false;
			}
			if (isOnEquipZone(opponent, card)) {
				return false;
			}
			return opponent.canEquip(card, true);
		});
		if (!pool.length) {
			return;
		}
		let card = pool[0];
		if (pool.length > 1) {
			const result = await actor
				.chooseCardButton({
					cards: pool,
					prompt: `姻计：令${get.translation(opponent)}装备一张其因此失去的装备牌`,
					ai(button) {
						return opponent.canEquip(button.link, true) ? 6 - get.equipValue(button.link) : 0;
					},
				})
				.forResult();
			if (!result?.links?.length) {
				return;
			}
			card = result.links[0];
		}
		await equipYinjiLostOn(opponent, card, actor);
		return;
	}
	const pool = opponentLost.filter((card) => canYinjiFollowUse(actor, opponent, card, types));
	if (!pool.length) {
		return;
	}
	const result = await actor
		.chooseCardButton({
			cards: pool,
			prompt: `姻计：对${get.translation(opponent)}使用一张其因此失去的牌`,
			ai(button) {
				const card = button.link;
				if (get.type(card, actor, false) === "equip") {
					return opponent.canEquip(card, true) ? 5 : 0;
				}
				return actor.getUseValue(card, opponent);
			},
		})
		.forResult();
	if (!result?.links?.length) {
		return;
	}
	await yinjiExecuteLostUse(actor, opponent, result.links[0]);
}

function canMingxinGive(useEvt) {
	if (!useEvt?.cards?.length) {
		return false;
	}
	if (get.is.virtualCard?.(useEvt.card)) {
		return false;
	}
	return useEvt.cards.some((c) => get.itemtype(c) === "card");
}

export const skills = {
	qunfang_yinji: {
		audio: 2,
		init(player) {
			player.storage.qunfang_yinji_card ??= "qunfang_yiyi";
		},
		getCardName(player) {
			return getYinjiCard(player);
		},
		group: ["qunfang_yinji_recover"],
		subSkill: {
			recover: {
				audio: "qunfang_yinji",
				trigger: { global: "recoverAfter" },
				filter(event, player) {
					if (!event.player || event.player === player || !event.player.isIn()) {
						return false;
					}
					if (!event.num) {
						return false;
					}
					return !player.hasSkill("qunfang_yinji_used");
				},
				async cost(event, trigger, player) {
					event.result = await player
						.chooseBool(get.prompt("qunfang_yinji", trigger.player), `与其依次视为使用一张【${get.translation(getYinjiCard(player))}】`)
						.set("ai", () => {
							const { player, recoverer } = get.event();
							return get.recoverEffect(recoverer, player, player) > 0 ? 0.5 : 0;
						})
						.set("recoverer", trigger.player)
						.forResult();
				},
				logTarget: "player",
				async content(event, trigger, player) {
					const recoverer = trigger.player;
					const cardName = getYinjiCard(player);
					player.addTempSkill("qunfang_yinji_used", "phaseAfter");

					const h0 = player.getHistory("lose").length;
					const h1 = recoverer.getHistory("lose").length;
					const okPlayer = await virtualYinjiCard(player, recoverer, cardName);
					const okRecoverer = await virtualYinjiCard(recoverer, player, cardName);
					if (!okPlayer || !okRecoverer) {
						return;
					}

					const lostPlayer = collectLoseCardsFromVirtual(player, h0, cardName);
					const lostRecoverer = collectLoseCardsFromVirtual(recoverer, h1, cardName);

					const types = intersectTypes(lostPlayer, lostRecoverer, player, recoverer);
					if (!types.length) {
						return;
					}
					await useLostCard(player, recoverer, lostRecoverer, types, cardName);
					await useLostCard(recoverer, player, lostPlayer, types, cardName);
				},
			},
			used: {
				charlotte: true,
			},
		},
	},
	qunfang_mingxin: {
		audio: 2,
		dutySkill: true,
		init(player) {
			player.storage.qunfang_mingxin_give ??= {};
			player.storage.qunfang_mingxin_damage ??= 0;
			player.storage.qunfang_mingxin_directHit ??= [];
		},
		mod: {
			wuxieRespondable(card, player, target, current) {
				if (player.storage.qunfang_mingxin_directHit?.includes(card)) {
					return false;
				}
			},
		},
		async checkSuccess(player, trigger) {
			if (player.storage.qunfang_mingxin_done) {
				return;
			}
			const give = player.storage.qunfang_mingxin_give || {};
			if (Object.keys(give).some((id) => (give[id] || 0) >= 3)) {
				await game
					.createTrigger("qunfang_mingxinAchieve", "qunfang_mingxin_achieve", player, trigger || get.event())
					.forResult();
			}
		},
		async checkFail(player, trigger) {
			if (player.storage.qunfang_mingxin_done) {
				return;
			}
			if ((player.storage.qunfang_mingxin_damage || 0) >= 3) {
				await game
					.createTrigger("qunfang_mingxinFail", "qunfang_mingxin_fail", player, trigger || get.event())
					.forResult();
			}
		},
		group: [
			"qunfang_mingxin_opt",
			"qunfang_mingxin_damage",
			"qunfang_mingxin_clear",
			"qunfang_mingxin_achieve",
			"qunfang_mingxin_fail",
		],
		subSkill: {
			achieve: {
				audio: "qunfang_mingxin",
				trigger: { player: "qunfang_mingxinAchieve" },
				forced: true,
				skillAnimation: true,
				animationColor: "fire",
				filter(event, player) {
					if (player.storage.qunfang_mingxin_done) {
						return false;
					}
					const give = player.storage.qunfang_mingxin_give || {};
					return Object.keys(give).some((id) => (give[id] || 0) >= 3);
				},
				async content(event, trigger, player) {
					player.storage.qunfang_mingxin_done = true;
					player.awakenSkill("qunfang_mingxin");
					game.log(player, "成功完成使命");
					await player.changeGroup("shu");
					player.changeSkin("qunfang_mingxin", "qunfang_sunshangxiang_shu");
					await player.addSkills("dcsbtuicheng");
					player.storage.qunfang_yinji_card = "tuixinzhifu";
					player.markSkill("qunfang_yinji");
				},
			},
			fail: {
				audio: "qunfang_mingxin",
				trigger: { player: "qunfang_mingxinFail" },
				forced: true,
				skillAnimation: true,
				animationColor: "wood",
				filter(event, player) {
					if (player.storage.qunfang_mingxin_done) {
						return false;
					}
					return (player.storage.qunfang_mingxin_damage || 0) >= 3;
				},
				async content(event, trigger, player) {
					player.storage.qunfang_mingxin_done = true;
					player.awakenSkill("qunfang_mingxin");
					game.log(player, "使命失败");
					await player.changeGroup("wu");
					player.changeSkin("qunfang_mingxin", "qunfang_sunshangxiang_wu");
					await player.addSkills("xiaoji");
					player.storage.qunfang_yinji_card = "qunfang_toulianghuanzhu";
					player.markSkill("qunfang_yinji");
				},
			},
			opt: {
				audio: "qunfang_mingxin",
				trigger: { player: "useCard" },
				filter(event, player) {
					if (player.storage.qunfang_mingxin_done) {
						return false;
					}
					if (event.player !== player) {
						return false;
					}
					const target = event.targets?.[0];
					return event.targets?.length === 1 && target?.isIn();
				},
				logTarget(event) {
					return event.targets?.[0];
				},
				async cost(event, trigger, player) {
					const useEvt = trigger;
					const target = useEvt.targets[0];
					const canGive = canMingxinGive(useEvt);
					const choices = canGive ? ["交给其", "令此牌不可响应", "cancel2"] : ["令此牌不可响应", "cancel2"];
					const result = await player
						.chooseControl(choices)
						.set("prompt", get.prompt("qunfang_mingxin", target))
						.set("ai", () => {
							const { player, target, card, canGive: give } = get.event();
							const att = get.attitude(player, target);
							if (give && att > 0) {
								return "交给其";
							}
							if (card && get.tag(card, "damage")) {
								return "令此牌不可响应";
							}
							return "cancel2";
						})
						.set("target", target)
						.set("card", useEvt.card)
						.set("canGive", canGive)
						.forResult();
					if (result.control === "cancel2") {
						event.result = { bool: false };
					} else {
						event.result = { bool: true, cost_data: result.control };
					}
				},
				async content(event, trigger, player) {
					const useEvt = trigger;
					const target = useEvt.targets[0];
					if (!target?.isIn()) {
						return;
					}
					if (event.cost_data === "交给其") {
						if (!canMingxinGive(useEvt)) {
							return;
						}
						useEvt.cancel();
						const cards = useEvt.cards.filter((c) => get.itemtype(c) === "card");
						if (!cards.length) {
							return;
						}
						await player.give(cards, target);
						const id = target.playerid;
						player.storage.qunfang_mingxin_give[id] = (player.storage.qunfang_mingxin_give[id] || 0) + cards.length;
						await lib.skill.qunfang_mingxin.checkSuccess(player, trigger);
					} else {
						// 不可响应（含不可抵消）：dcquanshi + xinbenxi 选项3
						if (!useEvt.directHit) {
							useEvt.directHit = [];
						}
						useEvt.directHit.addArray(game.players);
						useEvt.nowuxie = true;
						useEvt.customArgs ??= {};
						useEvt.customArgs.default ??= {};
						useEvt.customArgs.default.directHit2 = true;
						player.storage.qunfang_mingxin_directHit.add(useEvt.card);
						useEvt.qunfang_mingxin_unrespond = true;
						game.log(useEvt.card, "不可被响应");
					}
				},
			},
			clear: {
				trigger: { player: "useCardAfter" },
				silent: true,
				forced: true,
				popup: false,
				filter(event, player) {
					return player.storage.qunfang_mingxin_directHit?.includes(event.card);
				},
				content(event, trigger, player) {
					player.storage.qunfang_mingxin_directHit.remove(trigger.card);
				},
			},
			damage: {
				audio: "qunfang_mingxin",
				trigger: { source: "damageSource" },
				forced: true,
				popup: false,
				filter(event, player) {
					if (player.storage.qunfang_mingxin_done) {
						return false;
					}
					const useEvt = event.getParent("useCard");
					return !!useEvt?.qunfang_mingxin_unrespond;
				},
				async content(event, trigger, player) {
					player.storage.qunfang_mingxin_damage = (player.storage.qunfang_mingxin_damage || 0) + (trigger.num || 1);
					await lib.skill.qunfang_mingxin.checkFail(player, trigger);
				},
			},
		},
	},
	...qunfangZhaoxiangSkills,
	...qunfangXiahoushiSkills,
	...qunfangCaiwenjiSkills,
};
