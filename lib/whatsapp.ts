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

function logLocalMessage(
  to: string,
  message: Record<string, unknown>
) {
  console.log(
    "\n========== WHATSAPP LOCAL =========="
  );

  console.log(
    `TO: ${to}`
  );

  console.log(
    JSON.stringify(
      message,
      null,
      2
    )
  );

  console.log(
    "====================================\n"
  );

  return {
    local: true,
    to,
    message
  };
}

async function sendMessage(
  to: string,
  message: Record<string, unknown>
) {
  if (isLocalMode()) {
    return logLocalMessage(
      to,
      message
    );
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
    const error =
      await response.text();

    throw new Error(
      `WhatsApp API error: ${error}`
    );
  }

  return response.json();
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
  }[]
) {
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

              rows:
                restaurants
                  .slice(0, 10)
                  .map(
                    (
                      restaurant
                    ) => ({
                      id:
                        `restaurant_${restaurant.id}`,

                      title:
                        restaurant.name
                    })
                  )
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
  }[]
) {
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

              rows:
                items
                  .slice(0, 10)
                  .map(
                    (item) => ({
                      id:
                        `item_${item.id}`,

                      title:
                        item.name,

                      description:
                        `₹${item.price}`
                    })
                  )
            }
          ]
        }
      }
    }
  );
}