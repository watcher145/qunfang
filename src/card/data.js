/**
 * 扩展卡牌定义
 */
import { game, get, ui } from "noname";

export const cardData = {
	qunfang_yiyi: {
		fullskin: true,
		type: "trick",
		enable: true,
		filterTarget(card, player, target) {
			return target === player;
		},
		selectTarget: 1,
		content() {
			target.draw(2);
			target.chooseToDiscard(2, "he", true).ai = get.disvalue;
		},
		ai: {
			order: 7,
			value: 5,
			useful: 3,
			wuxie(target, card, player, viewer, status) {
				if (target !== player) {
					return 0;
				}
				if (status * get.attitude(viewer, player._trueMe || player) > 0) {
					return 0;
				}
			},
			tag: {
				draw: 2,
				loseCard: 2,
				discard: 2,
			},
			result: {
				target(player, target) {
					return target === player ? 2 : 0;
				},
			},
		},
	},
	qunfang_toulianghuanzhu: {
		fullskin: true,
		type: "trick",
		enable: true,
		filter(event, player) {
			return game.hasPlayer(
				(current) => current !== player && current.countCards("e") > player.countCards("e"),
			);
		},
		filterTarget(card, player, target) {
			return target !== player && target.countCards("e") > player.countCards("e");
		},
		selectTarget: 1,
		async content(event, trigger, player) {
			const target = event.target ?? event.targets?.[0];
			if (!target?.isIn()) {
				return;
			}
			const diff = target.countCards("e") - player.countCards("e");
			const num = Math.ceil(diff / 2);
			if (num <= 0 || !target.countCards("e")) {
				return;
			}
			const result = await target
				.chooseCard("e", [num, num], true)
				.set("prompt", `偷梁换柱：将${get.cnNumber(num)}张装备牌置于${get.translation(player)}的装备区`)
				.set("ai", (card) => 6 - get.equipValue(card))
				.forResult();
			if (!result?.bool || !result.cards?.length) {
				return;
			}
			for (const card of result.cards) {
				if (!card || get.position(card, true) !== "e") {
					continue;
				}
				await target.lose(card, ui.special);
				if (player.canEquip(card, true)) {
					await player.equip(card);
				} else if (get.position(card, true) !== "d") {
					await game.cardsDiscard(card);
				}
			}
		},
		ai: {
			order: 4,
			wuxie(target, card, player, viewer, status) {
				if (target.countCards("e") <= player.countCards("e")) {
					return 0;
				}
				if (status * get.attitude(viewer, player._trueMe || player) > 0) {
					return 0;
				}
			},
			result: {
				target(player, target) {
					const diff = target.countCards("e") - player.countCards("e");
					if (diff <= 0) {
						return 0;
					}
					return Math.min(diff, 3);
				},
				player(player, target) {
					const diff = target.countCards("e") - player.countCards("e");
					if (diff <= 0) {
						return 0;
					}
					return Math.min(diff, 3);
				},
			},
		},
	},
};
