export function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

export function generateOrderNumber() {
  const timestamp = Date.now().toString().slice(-6);

  const random = Math.floor(
    100 + Math.random() * 900
  );

  return `OFF-${timestamp}-${random}`;
}