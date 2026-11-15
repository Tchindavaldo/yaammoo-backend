// Secret des codes de livraison (services/order/deliveryCode.service.js). Secret Fly, jamais dans git.
module.exports = {
  deliveryCodeSecret: () => process.env.DELIVERY_CODE_SECRET,
};
