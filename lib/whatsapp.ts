import { enqueueInboundWhatsappMessage, WhatsappPayload } from "@/lib/whatsapp-outbox";

const GRAPH_URL =
  "https://graph.facebook.com/v23.0";

function isLocalMode() {
  return (
    process.env.WHATSAPP_LOCAL_MODE === "true"
  );
}

function getConfig() {
  const token =
    process.env.WHATSAPP_ACCESS_TOKEN;

  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp environment variables are missing."
    );
  }

  return {
    token,
    phoneNumberId
  };
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function logLocalMessage() {
  console.info("WhatsApp local delivery suppressed.");
  return { local: true };
}

async function sendMessage(
  to: string,
  message: Record<string, unknown>
) {
  if (isLocalMode() && process.env.NODE_ENV === "production") {
    throw new Error("WhatsApp local mode is disabled in production.");
  }

  if (await enqueueInboundWhatsappMessage(to, message)) {
    return { queued: true };
  }

  if (isLocalMode()) {
    return logLocalMessage();
  }

  const {
    token,
    phoneNumberId
  } = getConfig();

  const response = await fetch(
    `${GRAPH_URL}/${phoneNumberId}/messages`,
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${token}`,

        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        messaging_product:
          "whatsapp",

        to: normalizePhone(to),

        ...message
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `WhatsApp API request failed with status ${response.status}.`
    );
  }

  return response.json();
}

export async function sendWhatsappPayload(
  to: string,
  message: WhatsappPayload,
) {
  return sendMessage(to, message);
}

export async function sendText(
  to: string,
  body: string
) {
  return sendMessage(
    to,
    {
      type: "text",

      text: {
        body
      }
    }
  );
}

export async function sendButtons(
  to: string,
  body: string,
  buttons: {
    id: string;
    title: string;
  }[]
) {
  return sendMessage(
    to,
    {
      type: "interactive",

      interactive: {
        type: "button",

        body: {
          text: body
        },

        action: {
          buttons:
            buttons
              .slice(0, 3)
              .map(
                (button) => ({
                  type: "reply",

                  reply: {
                    id:
                      button.id,

                    title:
                      button.title
                  }
                })
              )
        }
      }
    }
  );
}

export async function sendRestaurantList(
  to: string,
  restaurants: {
    id: number;
    name: string;
  }[],
  offset = 0,
) {
  const start = Math.max(0, offset);
  const hasPrevious = start > 0;
  const pageSize = 8;
  const page = restaurants.slice(start, start + pageSize);
  const hasNext = start + page.length < restaurants.length;
  const rows = page.map((restaurant) => ({
    id: `restaurant_${restaurant.id}`,
    title: restaurant.name.slice(0, 24),
  }));

  if (hasPrevious) {
    rows.unshift({ id: `restaurant_page_${Math.max(0, start - pageSize)}`, title: "Previous page" });
  }
  if (hasNext) {
    rows.push({ id: `restaurant_page_${start + page.length}`, title: "Next page" });
  }

  return sendMessage(
    to,
    {
      type: "interactive",

      interactive: {
        type: "list",

        body: {
          text:
            "Choose a restaurant from your area."
        },

        action: {
          button:
            "Restaurants",

          sections: [
            {
              title:
                "Available restaurants",

              rows
            }
          ]
        }
      }
    }
  );
}

export async function sendMenu(
  to: string,
  restaurantName: string,
  items: {
    id: number;
    name: string;
    price: number;
  }[],
  offset = 0,
) {
  const start = Math.max(0, offset);
  const hasPrevious = start > 0;
  const pageSize = 8;
  const page = items.slice(start, start + pageSize);
  const hasNext = start + page.length < items.length;
  const rows = page.map((item) => ({
    id: `item_${item.id}`,
    title: item.name.slice(0, 24),
    description: `₹${item.price}`,
  }));
  if (hasPrevious) {
    rows.unshift({
      id: `menu_page_${Math.max(0, start - pageSize)}`,
      title: "Previous page",
      description: "",
    });
  }
  if (hasNext) {
    rows.push({ id: `menu_page_${start + page.length}`, title: "Next page", description: "" });
  }

  return sendMessage(
    to,
    {
      type: "interactive",

      interactive: {
        type: "list",

        body: {
          text:
            `${restaurantName}\n\n` +
            "Choose an item to add to your cart."
        },

        action: {
          button:
            "View menu",

          sections: [
            {
              title:
                "Menu",

              rows
            }
          ]
        }
      }
    }
  );
}

export async function sendCartEditor(
  to: string,
  items: { menuItemId: number; name: string; price: number; quantity: number }[],
  offset = 0,
) {
  const start = Math.max(0, offset);
  const hasPrevious = start > 0;
  const pageSize = 8;
  const page = items.slice(start, start + pageSize);
  const hasNext = start + page.length < items.length;
  const rows = page.map((item) => ({
    id: `cart_item_${item.menuItemId}`,
    title: item.name.slice(0, 24),
    description: `${item.quantity} × ₹${item.price}`.slice(0, 72),
  }));
  if (hasPrevious) {
    rows.unshift({ id: `cart_page_${Math.max(0, start - pageSize)}`, title: "Previous page", description: "" });
  }
  if (hasNext) {
    rows.push({ id: `cart_page_${start + page.length}`, title: "Next page", description: "" });
  }

  return sendMessage(to, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Choose a cart item to change its quantity or remove it." },
      action: {
        button: "Edit cart",
        sections: [{ title: "Your items", rows }],
      },
    },
  });
}
