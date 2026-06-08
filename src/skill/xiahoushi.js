/**
 * 夏侯氏技能
 */
import { lib, game, get } from "noname";

function isBasicCard(card, player) {
	if (!card) {
		return false;
	}
	const t = get.type(card, player) || get.type2(card, player);
	return t === "basic";
}

function isLiuboShaEvent(event, player) {
	if (!event?.card || event.card.name !== "sha") {
		return false;
	}
	const user = event.player;
	if (!user?.isIn() || user === player) {
		return false;
	}
	if (!player.inRangeOf(user)) {
		return false;
	}
	return event.targets?.some((t) => t !== user);
}

function getLiuboUseCard(trigger) {
	return trigger.getParent?.("useCard") || trigger;
}

async function liuboLetUserDrawOrDiscard(player, user, recastCard) {
	const needBasic = !player.storage.qunfang_liubo_no_basic;
	if (needBasic && !isBasicCard(recastCard, player)) {
		return;
	}
	const list = ["摸一张牌"];
	if (user.countDiscardableCards(user, "he") > 0) {
		list.push("弃一张牌");
	}
	const result = await player
		.chooseControl(list)
		.set("prompt", "流波：令" + get.translation(user) + "摸一张牌或弃一张牌")
		.set("ai", () => {
			const { player: p, target } = get.event();
			return get.attitude(p, target) > 0 ? "摸一张牌" : "弃一张牌";
		})
		.set("target", user)
		.forResult();
	if (result?.control === "摸一张牌") {
		await user.draw();
	} else if (result?.control === "弃一张牌") {
		await user.chooseToDiscard("he", true);
	}
}

export const qunfangXiahoushiSkills = {
	qunfang_liubo: {
		audio: 2,
		intro: {
			content(storage, player) {
				const fn = lib.dynamicTranslate?.qunfang_liubo;
				return fn ? fn(player) : lib.translate.qunfang_liubo_info;
			},
		},
		group: ["qunfang_liubo_recast", "qunfang_liubo_draw"],
	},
	qunfang_liubo_recast: {
		audio: "qunfang_liubo",
		trigger: { global: "useCardToTargeted" },
		direct: true,
		filter(event, player) {
			if (!isLiuboShaEvent(event, player)) {
				return false;
			}
			return player.hasCard((card) => player.canRecast(card), "he");
		},
		async content(event, trigger, player) {
			const user = trigger.player;
			const result = await player
				.chooseCard(get.prompt("qunfang_liubo", user), "he", (card, p) => p.canRecast(card))
				.set("ai", (card) => 6 - get.value(card))
				.forResult();
			if (!result?.bool || !result.cards?.length) {
				return;
			}
			player.logSkill("qunfang_liubo", user);
			const card = result.cards[0];
			await player.recast(result.cards);
			await liuboLetUserDrawOrDiscard(player, user, card);
		},
	},
	qunfang_liubo_draw: {
		audio: "qunfang_liubo",
		trigger: { global: "useCardToEnd" },
		direct: true,
		filter(event, player) {
			if (!isLiuboShaEvent(event, player)) {
				return false;
			}
			const user = event.player;
			if (!player.storage.qunfang_liubo_no_equal && player.countCards("h") !== user.countCards("h")) {
				return false;
			}
			return true;
		},
		async content(event, trigger, player) {
			const user = trigger.player;
			const result = await player
				.chooseBool(get.prompt("qunfang_liubo", user), "是否与其各摸一张牌？")
				.set("ai", () => {
					const { player: p, target } = get.event();
					return get.effect(p, { name: "draw" }, p, p) + get.effect(target, { name: "draw" }, p, p);
				})
				.set("target", user)
				.forResult();
			if (!result?.bool) {
				return;
			}
			player.logSkill("qunfang_liubo", user);
			await game.asyncDraw([player, user]);
		},
	},
	qunfang_rensheng: {
		audio: 2,
		dutySkill: true,
		init(player) {
			player.storage.qunfang_rensheng_noCount ??= 0;
			player.storage.qunfang_rensheng_void ??= 0;
			player.storage.qunfang_rensheng_done ??= false;
		},
		async checkSuccess(player, trigger) {
			if (player.storage.qunfang_rensheng_done) {
				return;
			}
			if ((player.storage.qunfang_rensheng_noCount || 0) >= 3) {
				await game
					.createTrigger("qunfang_renshengAchieve", "qunfang_rensheng_achieve", player, trigger || get.event())
					.forResult();
			}
		},
		async checkFail(player, trigger) {
			if (player.storage.qunfang_rensheng_done) {
				return;
			}
			if ((player.storage.qunfang_rensheng_void || 0) >= 3) {
				await game
					.createTrigger("qunfang_renshengFail", "qunfang_rensheng_fail", player, trigger || get.event())
					.forResult();
			}
		},
		group: ["qunfang_rensheng_opt", "qunfang_rensheng_achieve", "qunfang_rensheng_fail"],
		subSkill: {
			achieve: {
				audio: "qunfang_rensheng",
				trigger: { player: "qunfang_renshengAchieve" },
				forced: true,
				skillAnimation: true,
				animationColor: "fire",
				filter(event, player) {
					if (player.storage.qunfang_rensheng_done) {
						return false;
					}
					return (player.storage.qunfang_rensheng_noCount || 0) >= 3;
				},
				async content(event, trigger, player) {
					player.storage.qunfang_rensheng_done = true;
					player.awakenSkill("qunfang_rensheng");
					game.log(player, "成功完成使命");
					await player.changeGroup("shu");
					await player.addSkills("reyanyu");
					player.storage.qunfang_liubo_no_basic = true;
					player.markSkill("qunfang_liubo");
				},
			},
			fail: {
				audio: "qunfang_rensheng",
				trigger: { player: "qunfang_renshengFail" },
				forced: true,
				skillAnimation: true,
				animationColor: "water",
				filter(event, player) {
					if (player.storage.qunfang_rensheng_done) {
						return false;
					}
					return (player.storage.qunfang_rensheng_void || 0) >= 3;
				},
				async content(event, trigger, player) {
					player.storage.qunfang_rensheng_done = true;
					player.awakenSkill("qunfang_rensheng");
					game.log(player, "使命失败");
					await player.changeGroup("wei");
					await player.addSkills("liuli");
					player.storage.qunfang_liubo_no_equal = true;
					player.markSkill("qunfang_liubo");
				},
			},
		},
	},
	qunfang_rensheng_opt: {
		audio: "qunfang_rensheng",
		trigger: { global: "useCardToTargeted" },
		filter(event, player) {
			if (player.storage.qunfang_rensheng_done) {
				return false;
			}
			const user = event.player;
			if (!user?.isIn() || user === player) {
				return false;
			}
			if (user.countCards("h") < player.countCards("h")) {
				return false;
			}
			if (!isBasicCard(event.card, user)) {
				return false;
			}
			return event.targets?.length > 0;
		},
		async cost(event, trigger, player) {
			const user = trigger.player;
			const result = await player
				.chooseControl(["不计入使用次数", "无效", "cancel2"])
				.set("prompt", get.prompt("qunfang_rensheng", user))
				.set("ai", () => {
					const { player: p, target } = get.event();
					return get.attitude(p, target) >= 0 ? "不计入使用次数" : "无效";
				})
				.set("target", user)
				.forResult();
			if (result?.control && result.control !== "cancel2") {
				event.result = { bool: true, cost_data: result.control };
			}
		},
		async content(event, trigger, player) {
			const user = trigger.player;
			player.logSkill("qunfang_rensheng", user);
			const useEvt = getLiuboUseCard(trigger);
			if (event.cost_data === "不计入使用次数") {
				if (useEvt.addCount !== false) {
					useEvt.addCount = false;
					const stat = user.getStat()?.card;
					const name = trigger.card?.name;
					if (stat && name && typeof stat[name] === "number") {
						stat[name]--;
					}
				}
				player.storage.qunfang_rensheng_noCount = (player.storage.qunfang_rensheng_noCount || 0) + 1;
				await lib.skill.qunfang_rensheng.checkSuccess(player, trigger);
			} else if (event.cost_data === "无效") {
				const useCardEvt = trigger.getParent("useCard") || trigger.getParent();
				if (useCardEvt) {
					useCardEvt.all_excluded = true;
					useCardEvt.targets.length = 0;
					game.log(trigger.card, "被无效了");
				}
				player.storage.qunfang_rensheng_void = (player.storage.qunfang_rensheng_void || 0) + 1;
				await lib.skill.qunfang_rensheng.checkFail(player, trigger);
			}
		},
	},
};
