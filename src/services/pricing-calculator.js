/**
 * PricingCalculator — Seller Net Price Protection
 *
 * Hitung gross-up dari target_net (harga bersih tenant) + provider fee.
 *
 * Formula:
 *   c_eff = commission_rate × (1 + commission_ppn_rate)
 *   f_eff = provider.fee_percentage × (1 + provider.tax_percentage)
 *   f_flat_eff = provider.fee_flat × (1 + provider.tax_percentage)
 *
 *   selling_price = ceil((target_net + f_flat_eff) / (1 - c_eff - f_eff - pph23))
 */
function calculatePricing({
  targetNet,
  commissionRate = 0.02,
  commissionPpnRate = 0.11,
  provider,
  pph23Rate = 0,
}) {
  const targetNetInt = Math.round(Number(targetNet));
  if (!Number.isFinite(targetNetInt) || targetNetInt <= 0) {
    throw new Error("targetNet harus > 0");
  }
  if (!provider || !provider.fee_type) {
    throw new Error("Provider tidak valid.");
  }
  if (commissionRate + (provider.fee_percentage || 0) >= 1) {
    throw new Error("Total rate >= 100%, tidak valid.");
  }

  // Cast ke Number untuk jaga-jaga kalau dari DB nilainya string
  const commRate = Number(commissionRate) || 0;
  const commPpnRate = Number(commissionPpnRate) || 0;
  const feePct = Number(provider.fee_percentage) || 0;
  const feeFlat = Number(provider.fee_flat) || 0;
  const taxPct = Number(provider.tax_percentage) || 0;
  const p23Rate = Number(pph23Rate) || 0;

  const cEff = commRate * (1 + commPpnRate);
  const fEff = feePct * (1 + taxPct);
  const fFlatEff = feeFlat * (1 + taxPct);
  const p23Eff = p23Rate;

  const rawSellingPrice = (targetNetInt + fFlatEff) / (1 - cEff - fEff - p23Eff);
  const sellingPrice = Math.ceil(rawSellingPrice);

  const commission = Math.floor(sellingPrice * commRate);
  const commissionPpn = Math.floor(sellingPrice * commRate * commPpnRate);
  const paymentFee = Math.floor(sellingPrice * feePct) + feeFlat;
  const paymentPpn = Math.floor(sellingPrice * feePct * taxPct)
                   + Math.floor(feeFlat * taxPct);
  const pph23 = Math.floor(sellingPrice * p23Rate);

  const totalPaymentFee = paymentFee + paymentPpn;
  let clampedTotalPaymentFee = totalPaymentFee;
  if (provider.fee_min && clampedTotalPaymentFee < provider.fee_min) {
    clampedTotalPaymentFee = provider.fee_min;
  }
  if (provider.fee_max && clampedTotalPaymentFee > provider.fee_max) {
    clampedTotalPaymentFee = provider.fee_max;
  }

  let tenantNet = sellingPrice - commission - commissionPpn - clampedTotalPaymentFee - pph23;
  let roundingAdjustment = 0;

  if (tenantNet < targetNetInt) {
    roundingAdjustment = targetNetInt - tenantNet;
    tenantNet = targetNetInt;
  }

  return {
    targetNet: targetNetInt,
    sellingPrice,
    commission,
    commissionPpn,
    paymentFee: clampedTotalPaymentFee,
    paymentPpn,
    pph23,
    tenantNet,
    roundingAdjustment,
    snapshot: {
      commissionRate,
      commissionPpnRate,
      providerCode: provider.code,
      providerFeeType: provider.fee_type,
      providerFeePercentage: provider.fee_percentage,
      providerFeeFlat: provider.fee_flat,
      providerFeeMin: provider.fee_min,
      providerFeeMax: provider.fee_max,
      providerTaxPercentage: provider.tax_percentage,
      pph23Rate,
      calculatedAt: new Date().toISOString(),
    },
  };
}

module.exports = { calculatePricing };

