export function money(value: number) {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }
  ).format(value);
}

export function getIndiaDateParts(
  date = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "2-digit"
      }
    ).formatToParts(date);

  const day =
    parts.find(
      (part) =>
        part.type === "day"
    )?.value || "";

  const month =
    parts.find(
      (part) =>
        part.type === "month"
    )?.value || "";

  const year =
    parts.find(
      (part) =>
        part.type === "year"
    )?.value || "";

  return {
    day,
    month,
    year,
    dateKey: `20${year}-${month}-${day}`,
    dateCode:
      `${day}${month}${year}`
  };
}

export function formatOrderNumber(
  restaurantId: number,
  dateCode: string,
  orderCount: number
) {
  const restaurantCode =
    restaurantId
      .toString()
      .padStart(3, "0");

  const sequenceCode =
    orderCount
      .toString()
      .padStart(3, "0");

  return `#${restaurantCode}${dateCode}${sequenceCode}`;
}