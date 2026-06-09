/**
 * 技能本体
 */
import { lib, game, get, ui, _status } from "noname";
import { qunfangZhaoxiangSkills } from "./zhaoxiang.js";
import { qunfangXiahoushiSkills } from "./xiahoushi.js";
import { qunfangCaiwenjiSkills } from "./caiwenji.js";

const qunfangShoudaoPhases = [
	["phaseJudge", "判定阶段"],
	["phaseDraw", "摸牌阶段"],
	["phaseUse", "出牌阶段"],
	["phaseDiscard", "弃牌阶段"],
];
const qunfangShoudaoPhaseNames = qunfangShoudaoPhases.map((item) => item[0]);

function getShoudaoPhaseName(eventName) {
	const phase = eventName?.replace(/(Before|After|Skipped|Cancelled)$/, "");
	return qunfangShoudaoPhaseNames.includes(phase) ? phase : null;
}

function getShoudaoPhaseFromLink(link) {
	const value = Array.isArray(link) ? link[0] : link;
	if (qunfangShoudaoPhaseNames.includes(value)) return value;
	return qunfangShoudaoPhases.find((item) => item[1] == value)?.[0] || value;
}

function getShoudaoStoredPhases(player) {
	const storage = player.storage.qunfang_shoudao_phases || [];
	const phases = [];
	for (const phase of storage.map(getShoudaoPhaseFromLink)) {
		if (qunfangShoudaoPhaseNames.includes(phase) && !phases.includes(phase)) {
			phases.push(phase);
		}
	}
	if (phases.length != storage.length || phases.some((phase, index) => phase != storage[index])) {
		player.storage.qunfang_shoudao_phases = phases;
	}
	return phases;
}

function getShoudaoPhaseText(phase) {
	return qunfangShoudaoPhases.find((item) => item[0] == phase)?.[1] || get.translation(phase);
}

function addShoudaoRoundSkipped(player, phase) {
	if (!qunfangShoudaoPhaseNames.includes(phase)) return;
	player.storage.qunfang_shoudao_round_skipped ??= [];
	if (!player.storage.qunfang_shoudao_round_skipped.includes(phase)) {
		player.storage.qunfang_shoudao_round_skipped.push(phase);
		player.storage.qunfang_shoudao_round_count = (player.storage.qunfang_shoudao_round_count || 0) + 1;
	}
}

const qunfangFunianFuSkill = "qunfang_funian_fu";

function getFunianFuSource(card) {
	return card?.storage?.qunfang_funian_source;
}

function getFunianFuCards(target, source, suit, filter) {
	return target.getExpansions(qunfangFunianFuSkill).filter((card) => {
		if (source && getFunianFuSource(card) !== source) return false;
		if (suit && get.suit(card, false) !== suit) return false;
		const owner = getFunianFuSource(card);
		return owner?.isIn?.() && (!filter || filter(card, owner));
	});
}

function getFunianUniqueMostTarget(source) {
	let target = null, max = 0, tied = false;
	for (const current of game.filterPlayer()) {
		const count = getFunianFuCards(current, source).length;
		if (count > max) {
			target = current;
			max = count;
			tied = false;
		} else if (count == max && count > 0) {
			tied = true;
		}
	}
	return max > 0 && !tied ? target : null;
}

function hasCardsPutIntoPile(event) {
	if (event.name === "cardsGotoPile") {
		return event.cards?.length > 0;
	}
	if (event.name === "lose") {
		if (event.position === ui.cardPile && event.getlx !== false && event.cards2?.length) {
			return true;
		}
	}
	return game.hasPlayer((target) => {
		return target.hasHistory("lose", (evt) => evt.getParent() === event && evt.position === ui.cardPile && evt.cards2?.length);
	});
}

function isQunfangDamageCard(card) {
	return !!card && (get.tag(card, "damage") || get.is.damageCard?.(card));
}

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

function updateLuanpeiEffectMark(target) {
	const hasEffect = (target.storage.qunfang_luanpei_damage || 0) > 0 || (target.storage.qunfang_luanpei_sha || 0) > 0;
	if (hasEffect) {
		target.addSkill("qunfang_luanpei_effect");
		target.markSkill("qunfang_luanpei_effect");
	} else {
		target.removeSkill("qunfang_luanpei_effect");
	}
}

function addLuanpeiDamage(target, num = 1) {
	target.storage.qunfang_luanpei_damage = (target.storage.qunfang_luanpei_damage || 0) + num;
	target.addTempSkill("qunfang_luanpei_damage", "phaseAfter");
	updateLuanpeiEffectMark(target);
}

function addLuanpeiSha(target, num = 1) {
	target.storage.qunfang_luanpei_sha = (target.storage.qunfang_luanpei_sha || 0) + num;
	target.addTempSkill("qunfang_luanpei_sha", "roundStart");
	updateLuanpeiEffectMark(target);
}

function getLuanpeiStateDescription(storage) {
	return storage
		? "当其他角色/你使用【杀】指定目标后，你可以交给其/弃置至少两张牌，令其/你本回合造成的伤害+1或出牌阶段使用【杀】的次数上限+1直到本轮结束。"
		: "当其他角色/你回复体力后，你可以交给其/弃置至少两张牌，令其/你本回合造成的伤害+1或出牌阶段使用【杀】的次数上限+1直到本轮结束。";
}

function getTongzhengGainTargets(event, player) {
	if (!event?.getg || !event?.getl || !event.getl(player)?.cards2?.length) return [];
	return game
		.filterPlayer((target) => {
			if (target === player) return false;
			const gained = event.getg(target);
			if (!gained?.length) return false;
			if (event.giver === player) return true;
			return event.getl(player).cards2.containsSome(...gained);
		})
		.sortBySeat();
}

function getTongzhengTargets(player) {
	return (player.storage.qunfang_tongzheng_targets || []).filter((target) => target?.isIn?.());
}

function getTongzhengTargetDamage(player) {
	return getTongzhengTargets(player).reduce((sum, target) => {
		let num = 0;
		target.getHistory("sourceDamage", (evt) => {
			if (evt.num > 0) num += evt.num;
		});
		return sum + num;
	}, 0);
}

function getTongzhengSelfDamage(player) {
	let num = 0;
	player.getHistory("sourceDamage", (evt) => {
		if (evt.num > 0) num += evt.num;
	});
	return num;
}

function getTongzhengX(player) {
	return getTongzhengTargetDamage(player) + getTongzhengSelfDamage(player);
}

function updateTongzhengMark(player) {
	if (getTongzhengTargets(player).length || getTongzhengTargetDamage(player) || getTongzhengSelfDamage(player)) {
		player.markSkill("qunfang_tongzheng");
	} else {
		player.unmarkSkill("qunfang_tongzheng");
	}
}

function clearTongzhengStorage(player) {
	player.storage.qunfang_tongzheng_targets = [];
	updateTongzhengMark(player);
}

function canUseTongzhengSameName(player, card) {
	const name = get.name(card, false);
	if (!name) return false;
	return player.hasCard((current) => {
		const currentName = get.name(current, player);
		if (currentName !== "unsure" && currentName !== name) return false;
		return player.hasUseTarget(current, false, false);
	}, "hs");
}

function getJiahongCurrentTarget() {
	return _status.currentPhase?.isIn?.() ? _status.currentPhase : null;
}

function getJiahongTargetSuits(target) {
	return target
		.getCards("h")
		.map((card) => get.suit(card, target))
		.filter((suit) => lib.suit.includes(suit))
		.unique();
}

function getJiahongTrickSuits(name, nature) {
	return lib.card.list
		.filter((card) => {
			if (card[2] !== name) return false;
			if (nature !== undefined) return card[3] === nature;
			return true;
		})
		.map((card) => card[0])
		.filter((suit) => lib.suit.includes(suit))
		.unique();
}

function getJiahongVcardList(event, player) {
	const target = getJiahongCurrentTarget();
	if (!target || typeof event?.filterCard !== "function") return [];
	const targetSuits = getJiahongTargetSuits(target);
	return get.inpileVCardList((info) => {
		const type = info[0];
		const name = info[2];
		const nature = info[3];
		if (type === "basic") {
			const card = get.autoViewAs({ name, nature, isCard: true }, "unsure");
			return event.filterCard(card, player, event);
		}
		if (type !== "trick" && type !== "delay") return false;
		const suits = getJiahongTrickSuits(name, nature);
		if (!suits.length || suits.some((suit) => targetSuits.includes(suit))) return false;
		const card = get.autoViewAs({ name, nature, isCard: true }, "unsure");
		return event.filterCard(card, player, event);
	});
}

async function proceedJiahongFlow(player) {
	const target = getJiahongCurrentTarget();
	if (!target) return null;
	player.addTempSkill("qunfang_jiahong_used", { global: "phaseAfter" });
	await target.draw(2);
	if (target.countCards("h")) {
		await target.showHandcards(`${get.translation(player)}对${get.translation(target)}发动了【嫁纮】`);
	}
	if (getJiahongTargetSuits(target).length >= 4) {
		await player.link(true);
		player.addTempSkill("qunfang_jiahong_blocker", { global: "phaseAfter" });
		return { target, blocked: true };
	}
	const turnResult = await player
		.chooseBool("嫁纮：你可以翻面", "是否翻面？")
		.set("ai", () => true)
		.forResult();
	if (turnResult.bool) {
		await player.turnOver();
	}
	return { target, blocked: false };
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
	qunfang_shoudao: {
		audio: 2,
		mark: true,
		intro: {
			content(storage, player) {
				const chosen = getShoudaoStoredPhases(player);
				return chosen.length ? `已记录：${chosen.map(getShoudaoPhaseText).join("、")}` : "尚未记录阶段";
			},
		},
		init(player) {
			player.storage.qunfang_shoudao_phases ??= [];
			player.storage.qunfang_shoudao_round_skipped ??= [];
			player.storage.qunfang_shoudao_round_drawn ??= [];
			player.storage.qunfang_shoudao_round_executed ??= [];
			player.storage.qunfang_shoudao_round_count ??= 0;
		},
		trigger: {
			player: ["damageEnd", "phaseJudgeBefore", "phaseDrawBefore", "phaseUseBefore", "phaseDiscardBefore"],
			global: "dieAfter",
		},
		direct: true,
		priority: 100,
		filter(event, player) {
			if (player.storage.qunfang_shoudao_force_execute) {
				return false;
			}
			const phase = getShoudaoPhaseName(event.name);
			if (phase) {
				return getShoudaoStoredPhases(player).includes(phase);
			}
			if (event.name == "die" && event.player == player) {
				return false;
			}
			const chosen = getShoudaoStoredPhases(player);
			return qunfangShoudaoPhases.some((item) => !chosen.includes(item[0]));
		},
		async content(event, trigger, player) {
			const skippedPhase = getShoudaoPhaseName(trigger.name);
			if (skippedPhase) {
				game.log(player, "跳过了", `#y${getShoudaoPhaseText(skippedPhase)}`);
				addShoudaoRoundSkipped(player, skippedPhase);
				trigger.cancel();
				return;
			}
			const chosen = getShoudaoStoredPhases(player);
			const available = qunfangShoudaoPhases.filter((item) => !chosen.includes(item[0]));
			if (!available.length) return;
			const controls = available.map((item) => item[1]);
			const choose = await player.chooseControl(controls, "cancel2").set("prompt", "守悼：记录一个未被此技能记录的主要阶段并回复1点体力").set("ai", () => {
				const controls = get.event().controls;
				for (const phase of ["判定阶段", "弃牌阶段", "摸牌阶段", "出牌阶段"]) {
					if (controls.includes(phase)) return phase;
				}
				return "cancel2";
			}).forResult();
			if (choose.control == "cancel2") return;
			const phase = available.find((item) => item[1] == choose.control)?.[0];
			if (!qunfangShoudaoPhaseNames.includes(phase)) return;
			player.logSkill("qunfang_shoudao");
			chosen.add(phase);
			player.storage.qunfang_shoudao_phases = chosen;
			player.markSkill("qunfang_shoudao");
			game.log(player, "记录了", `#y${getShoudaoPhaseText(phase)}`);
			if (player.isDamaged()) {
				await player.recover();
			}
		},
		group: ["qunfang_shoudao_track", "qunfang_shoudao_execute", "qunfang_shoudao_draw", "qunfang_shoudao_reset"],
		subSkill: {
			track: {
				trigger: {
					global: ["phaseAnySkipped", "phaseAnyCancelled"],
				},
				silent: true,
				forced: true,
				popup: false,
				priority: 20,
				content(event, trigger, player) {
					const phase = getShoudaoPhaseName(event.triggername || trigger.name);
					if (!phase) return;
					if (trigger.player == player) {
						addShoudaoRoundSkipped(player, phase);
					}
				},
			},
			execute: {
				trigger: {
					global: "phaseAnyAfter",
				},
				silent: true,
				forced: true,
				popup: false,
				content(event, trigger, player) {
					const phase = getShoudaoPhaseName(event.triggername || trigger.name);
					if (!phase) return;
					player.storage.qunfang_shoudao_round_executed ??= [];
					if (trigger.player == player && !player.storage.qunfang_shoudao_round_executed.includes(phase)) {
						player.storage.qunfang_shoudao_round_executed.push(phase);
					}
				},
			},
			draw: {
				trigger: {
					global: ["phaseAnySkipped", "phaseAnyCancelled"],
				},
				direct: true,
				filter(event, player, triggername) {
					const phase = getShoudaoPhaseName(triggername || event.name);
					return phase && !player.storage.qunfang_shoudao_round_drawn?.includes(phase);
				},
				async content(event, trigger, player) {
					const phase = getShoudaoPhaseName(event.triggername || trigger.name);
					if (!phase) return;
					player.storage.qunfang_shoudao_round_drawn ??= [];
					player.storage.qunfang_shoudao_round_drawn.push(phase);
					const result = await player.chooseBool(get.prompt("qunfang_shoudao"), `本轮首次有角色跳过${getShoudaoPhaseText(phase)}，是否摸三张牌？`).set("ai", () => true).forResult();
					if (!result.bool) return;
					player.logSkill("qunfang_shoudao");
					await player.draw(3);
					const num = player.storage.qunfang_shoudao_round_count || 0;
					if (num <= 0 || !player.countCards("he")) return;
					const count = Math.min(num, player.countCards("he"));
					const cardResult = await player.chooseCard(`守悼：将至少${get.cnNumber(num)}张牌置于牌堆顶`, [count, Infinity], "he", true).set("ai", (card) => 6 - get.value(card)).forResult();
					if (cardResult.bool && cardResult.cards?.length) {
						player.$throw(cardResult.cards, 1000);
						game.log(player, "将", cardResult.cards, "置于牌堆顶");
						await player.lose({
							cards: cardResult.cards,
							position: ui.cardPile,
							insert_card: true,
						});
					}
				},
			},
			reset: {
				trigger: { global: "roundStart" },
				silent: true,
				forced: true,
				popup: false,
				content(event, trigger, player) {
					player.storage.qunfang_shoudao_round_skipped = [];
					player.storage.qunfang_shoudao_round_drawn = [];
					player.storage.qunfang_shoudao_round_executed = [];
					player.storage.qunfang_shoudao_round_count = 0;
				},
			},
		},
	},
	qunfang_funian: {
		audio: 2,
		trigger: {
			global: ["loseAfter", "loseAsyncAfter", "cardsGotoPileAfter"],
		},
		direct: true,
		filter(event, player) {
			return hasCardsPutIntoPile(event) && game.hasPlayer((target) => target != player);
		},
		async content(event, trigger, player) {
			const result = await player.chooseBool(get.prompt("qunfang_funian"), "是否进行判定？").set("ai", () => true).forResult();
			if (!result.bool) return;
			player.logSkill("qunfang_funian");
			const judge = await player.judge((card) => {
				const suit = get.suit(card, false);
				return suit == "diamond" || suit == "heart" ? 2 : 0;
			}).forResult();
			const card = judge.card, suit = get.suit(card, false);
			if (!card || (suit != "diamond" && suit != "heart")) return;
			const targetResult = await player.chooseTarget("抚念：将判定牌置于一名其他角色武将牌上，称为“抚”", true, (card, player, target) => target != player).set("ai", (target) => -get.attitude(player, target)).forResult();
			if (!targetResult.bool || !targetResult.targets?.length) return;
			const target = targetResult.targets[0];
			card.storage ??= {};
			card.storage.qunfang_funian_source = player;
			const next = target.addToExpansion(card, player, "giveAuto");
			next.gaintag.add(qunfangFunianFuSkill);
			await next;
			target.addSkill(qunfangFunianFuSkill);
			target.markSkill(qunfangFunianFuSkill);
			player.line(target);
			game.log(player, "将", card, "置于", target, "的武将牌上，称为", "#y“抚”");
		},
		group: "qunfang_funian_end",
		subSkill: {
			fu: {
				charlotte: true,
				mark: true,
				marktext: "抚",
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
				group: ["qunfang_funian_protect", "qunfang_funian_damage"],
			},
			protect: {
				charlotte: true,
				trigger: { global: "useCardToPlayer" },
				direct: true,
				filter(event, player) {
					if (!isQunfangDamageCard(event.card)) return false;
					if (!event.targets || event.targets.length != 1 || event.targets[0] != player) return false;
					return getFunianFuCards(player, null, "diamond", (card, source) => source != player && event.player.canUse(event.card, source, false)).length > 0;
				},
				async content(event, trigger, player) {
					const cards = getFunianFuCards(player, null, "diamond", (card, source) => source != player && trigger.player.canUse(trigger.card, source, false));
					const result = await player.chooseButton([get.prompt("qunfang_funian"), cards]).set("ai", (button) => {
						const source = getFunianFuSource(button.link);
						return get.effect(source, trigger.card, trigger.player, player) - get.effect(player, trigger.card, trigger.player, player);
					}).forResult();
					if (!result.bool || !result.links?.length) return;
					const card = result.links[0], source = getFunianFuSource(card);
					if (!source?.isIn?.()) return;
					await player.loseToDiscardpile(card);
					if (!player.getExpansions(qunfangFunianFuSkill).length) {
						player.removeSkill(qunfangFunianFuSkill);
					}
					trigger.targets.length = 0;
					if (trigger.getParent().triggeredTargets1) {
						trigger.getParent().triggeredTargets1.length = 0;
					}
					trigger.getParent().targets.push(source);
					player.line(source);
					game.log(player, "移去了", card, "，将", trigger.card, "的目标改为", source);
					await game.delay();
				},
			},
			damage: {
				charlotte: true,
				trigger: { player: "damageBegin3" },
				direct: true,
				filter(event, player) {
					return getFunianFuCards(player, null, "heart", (card, source) => source != player).length > 0;
				},
				async content(event, trigger, player) {
					const cards = getFunianFuCards(player, null, "heart", (card, source) => source != player);
					const result = await player.chooseButton([get.prompt("qunfang_funian"), cards]).set("ai", (button) => {
						const source = getFunianFuSource(button.link);
						return get.damageEffect(source, trigger.source, player, trigger.nature) - get.damageEffect(player, trigger.source, player, trigger.nature);
					}).forResult();
					if (!result.bool || !result.links?.length) return;
					const card = result.links[0], source = getFunianFuSource(card);
					if (!source?.isIn?.()) return;
					await player.loseToDiscardpile(card);
					if (!player.getExpansions(qunfangFunianFuSkill).length) {
						player.removeSkill(qunfangFunianFuSkill);
					}
					trigger.player = source;
					player.line(source);
					game.log(player, "移去了", card, "，将伤害转移给", source);
				},
			},
			end: {
				charlotte: true,
				trigger: { global: "roundEnd" },
				forced: true,
				popup: false,
				filter(event, player) {
					const target = getFunianUniqueMostTarget();
					return !!target && getShoudaoStoredPhases(player).length > 0;
				},
				async content(event, trigger, player) {
					const target = getFunianUniqueMostTarget();
					if (!target?.isIn?.()) return;
					const phases = getShoudaoStoredPhases(player).slice();
					if (!phases.length) return;
					player.logSkill("qunfang_funian", target);
					game.log(target, "按记录顺序执行", "#y守悼", "记录的阶段");
					target.storage.qunfang_shoudao_force_execute = true;
					try {
						for (const phase of phases) {
							if (!target.isIn()) break;
							game.log(target, "执行了", `#y${getShoudaoPhaseText(phase)}`);
							await target[phase]();
						}
					} finally {
						delete target.storage.qunfang_shoudao_force_execute;
					}
				},
			},
		},
	},
	qunfang_jiahong: {
		audio: 2,
		enable: ["chooseToUse", "chooseToRespond"],
		filter(event, player) {
			return !player.hasSkill("qunfang_jiahong_used") && !player.hasSkill("qunfang_jiahong_blocker") && !!getJiahongCurrentTarget() && getJiahongVcardList(event, player).length > 0;
		},
		hiddenCard(player, name) {
			if (!lib.inpile.includes(name)) return false;
			if (player.hasSkill("qunfang_jiahong_used") || player.hasSkill("qunfang_jiahong_blocker") || !getJiahongCurrentTarget()) return false;
			return getJiahongVcardList(_status.event, player).some((info) => info[2] === name);
		},
		chooseButton: {
			dialog(event, player) {
				return ui.create.dialog("嫁纮", [getJiahongVcardList(event, player), "vcard"], "hidden");
			},
			check(button) {
				const player = get.player();
				return player.getUseValue({ name: button.link[2], nature: button.link[3], isCard: true }) + 1;
			},
			backup(links) {
				return {
					audio: "qunfang_jiahong",
					filterCard: () => false,
					selectCard: -1,
					viewAs: { name: links[0][2], nature: links[0][3], isCard: true, storage: { qunfang_jiahong: true } },
					popname: true,
					async precontent(event, trigger, player) {
						const flow = await proceedJiahongFlow(player);
						if (!flow || flow.blocked) {
							const evt = event.getParent();
							evt.goto(0);
							delete evt.openskilldialog;
							return;
						}
						delete event.result.cards;
					},
				};
			},
			prompt(links) {
				return `发动嫁纮，视为${_status.event?.name === "chooseToRespond" ? "打出" : "使用"}${get.translation(links[0][3]) || ""}【${get.translation(links[0][2])}】`;
			},
		},
		subSkill: {
			used: {
				charlotte: true,
				onremove: true,
			},
			blocker: {
				charlotte: true,
				onremove: true,
			},
		},
		ai: {
			order: 8,
			respondSha: true,
			respondShan: true,
			save: true,
			skillTagFilter(player, tag) {
				if (player.hasSkill("qunfang_jiahong_used") || player.hasSkill("qunfang_jiahong_blocker") || !getJiahongCurrentTarget()) return false;
				const list = getJiahongVcardList(_status.event, player);
				if (tag === "respondSha") return list.some((info) => info[2] === "sha");
				if (tag === "respondShan") return list.some((info) => info[2] === "shan");
				if (tag === "save") return list.some((info) => info[2] === "tao");
				return true;
			},
		},
	},
	qunfang_yutiao: {
		audio: 2,
		locked: true,
		trigger: { player: ["turnOverAfter", "linkAfter"] },
		forced: true,
		async content(event, trigger, player) {
			await player.draw();
		},
		group: ["qunfang_yutiao_hit", "qunfang_yutiao_damage", "qunfang_yutiao_recover"],
		subSkill: {
			hit: {
				charlotte: true,
				trigger: { player: "useCard1" },
				forced: true,
				popup: false,
				filter(event, player) {
					return player.isTurnedOver();
				},
				content(event, trigger, player) {
					trigger.directHit.addArray(game.players);
					game.log(trigger.card, "不可被响应");
				},
				ai: { directHit_ai: true },
			},
			damage: {
				charlotte: true,
				trigger: { source: "damageBegin1" },
				forced: true,
				popup: false,
				filter(event, player) {
					return player.isLinked() && !!event.card;
				},
				content(event, trigger, player) {
					trigger.num++;
				},
			},
			recover: {
				charlotte: true,
				trigger: { global: "recoverBegin" },
				forced: true,
				popup: false,
				filter(event, player) {
					return player.isLinked() && event.source === player && !!event.card;
				},
				content(event, trigger, player) {
					trigger.num++;
				},
			},
		},
	},
	qunfang_luanpei: {
		audio: 2,
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		intro: {
			content(storage) {
				return getLuanpeiStateDescription(!!storage);
			},
		},
		trigger: {
			global: ["recoverAfter", "useCardToPlayered"],
		},
		direct: true,
		filter(event, player, name) {
			if (!event.player?.isIn?.() || player.countCards("he") < 2) return false;
			const storage = !!player.storage.qunfang_luanpei;
			if (name === "recoverAfter") {
				return !storage;
			}
			return storage && event.card?.name === "sha";
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const isSelf = target === player;
			const costText = isSelf ? "弃置至少两张牌" : `交给${get.translation(target)}至少两张牌`;
			const result = await player
				.chooseCard(get.prompt(event.name, target), `${costText}，令${isSelf ? "你" : get.translation(target)}获得一项强化`, [2, Infinity], "he")
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (!result.bool || !result.cards?.length) return;
			player.logSkill(event.name, target);
			if (isSelf) {
				await player.discard(result.cards);
			} else {
				await player.give(result.cards, target);
			}
			const controls = ["本回合造成的伤害+1", "出牌阶段使用【杀】的次数上限+1直到本轮结束"];
			const choice = await player
				.chooseControl(controls)
				.set("prompt", "鸾佩：选择一项强化效果")
				.set("ai", () => {
					const { target, player } = get.event();
					if (get.attitude(player, target) > 0) return "出牌阶段使用【杀】的次数上限+1直到本轮结束";
					return "本回合造成的伤害+1";
				})
				.set("target", target)
				.forResultControl();
			if (choice === "出牌阶段使用【杀】的次数上限+1直到本轮结束") {
				addLuanpeiSha(target, 1);
			} else {
				addLuanpeiDamage(target, 1);
			}
			player.changeZhuanhuanji(event.name);
		},
		subSkill: {
			effect: {
				charlotte: true,
				mark: true,
				marktext: "鸾",
				intro: {
					content(storage, player) {
						const list = [];
						const damage = player.storage.qunfang_luanpei_damage || 0;
						const sha = player.storage.qunfang_luanpei_sha || 0;
						if (damage > 0) list.push(`本回合造成的伤害+${damage}。`);
						if (sha > 0) list.push(`本轮出牌阶段使用【杀】的次数上限+${sha}。`);
						return list.length ? list.join("<br>") : "未获得强化效果。";
					},
				},
			},
			damage: {
				charlotte: true,
				trigger: { source: "damageBegin1" },
				forced: true,
				popup: false,
				filter(event, player) {
					return (player.storage.qunfang_luanpei_damage || 0) > 0;
				},
				content(event, trigger, player) {
					trigger.num += player.storage.qunfang_luanpei_damage || 0;
				},
				onremove(player) {
					delete player.storage.qunfang_luanpei_damage;
					updateLuanpeiEffectMark(player);
				},
			},
			sha: {
				charlotte: true,
				mod: {
					cardUsable(card, player, num) {
						if (card.name === "sha") return num + (player.storage.qunfang_luanpei_sha || 0);
					},
				},
				onremove(player) {
					delete player.storage.qunfang_luanpei_sha;
					updateLuanpeiEffectMark(player);
				},
			},
		},
	},
	qunfang_tongzheng: {
		audio: 2,
		mark: true,
		marktext: "征",
		intro: {
			content(storage, player) {
				const targets = getTongzhengTargets(player);
				return `获得过你牌的角色：${targets.length ? get.translation(targets) : "无"}；这些角色本回合造成的伤害数：${getTongzhengTargetDamage(player)}；你本回合造成的伤害数：${getTongzhengSelfDamage(player)}`;
			},
		},
		init(player) {
			player.storage.qunfang_tongzheng_targets ??= [];
		},
		group: [
			"qunfang_tongzheng_record",
			"qunfang_tongzheng_damage",
			"qunfang_tongzheng_draw",
			"qunfang_tongzheng_reset",
		],
		trigger: { global: "useCardAfter" },
		direct: true,
		filter(event, player) {
			if (!event.player || event.player === player || !getTongzhengTargets(player).includes(event.player)) return false;
			return canUseTongzhengSameName(player, event.card);
		},
		async content(event, trigger, player) {
			const name = get.name(trigger.card, false);
			const result = await player.chooseBool(get.prompt("qunfang_tongzheng", trigger.player), `是否使用一张${get.translation(name)}？`).set("ai", () => true).forResult();
			if (!result.bool) return;
			player.logSkill("qunfang_tongzheng", trigger.player);
			await player
				.chooseToUse(function (card, player, event) {
					const currentName = get.name(card, player);
					if (currentName !== "unsure" && currentName !== get.event().cardName) return false;
					return lib.filter.filterCard.apply(this, arguments);
				}, `同征：你可以使用一张${get.translation(name)}`)
				.set("cardName", name);
		},
		subSkill: {
			record: {
				charlotte: true,
				trigger: { global: ["gainAfter", "loseAsyncAfter"] },
				forced: true,
				popup: false,
				filter(event, player, name, target) {
					return getTongzhengGainTargets(event, player).includes(target);
				},
				getIndex(event, player) {
					return getTongzhengGainTargets(event, player);
				},
				logTarget(event, player, name, target) {
					return target;
				},
				content(event, trigger, player) {
					const target = event.indexedData;
					player.storage.qunfang_tongzheng_targets ??= [];
					player.storage.qunfang_tongzheng_targets.add(target);
					updateTongzhengMark(player);
				},
			},
			damage: {
				charlotte: true,
				trigger: { player: "damageEnd", source: "damageSource", global: "damageEnd" },
				forced: true,
				popup: false,
				filter(event, player, name) {
					if (name == "damageSource") return event.source === player;
					return !!event.source && (event.source === player || getTongzhengTargets(player).includes(event.source));
				},
				content(event, trigger, player) {
					updateTongzhengMark(player);
				},
			},
			draw: {
				charlotte: true,
				trigger: { global: "phaseJieshuBegin" },
				direct: true,
				filter(event, player) {
					return player.countCards("h") < getTongzhengX(player);
				},
				async content(event, trigger, player) {
					const x = getTongzhengX(player);
					const num = x - player.countCards("h");
					if (num <= 0) return;
					const result = await player.chooseBool(get.prompt("qunfang_tongzheng"), `是否将手牌摸至${get.cnNumber(x)}张？`).set("ai", () => true).forResult();
					if (!result.bool) return;
					player.logSkill("qunfang_tongzheng");
					await player.draw(num);
				},
			},
			reset: {
				charlotte: true,
				trigger: { global: "phaseAfter" },
				forced: true,
				popup: false,
				content(event, trigger, player) {
					clearTongzhengStorage(player);
				},
			},
		},
	},
	...qunfangZhaoxiangSkills,
	...qunfangXiahoushiSkills,
	...qunfangCaiwenjiSkills,
};
