export function pickWeightedReward(rewards) {
  if (!rewards.length) {
    return null
  }

  const weighted = rewards.map((reward) => ({
    reward,
    weight: 1 / Math.max(1, Number(reward.priority) || 1),
  }))

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = Math.random() * totalWeight

  for (const entry of weighted) {
    roll -= entry.weight
    if (roll <= 0) {
      return entry.reward
    }
  }

  return weighted[weighted.length - 1].reward
}
