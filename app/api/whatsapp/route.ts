import { NextResponse } from "next/server";



import {

  and,

  asc,

  eq,

  inArray,

  sql

} from "drizzle-orm";



import { db } from "@/db";



import {

  restaurants,

  menuItems,

  orders,

  orderItems,

  restaurantDailyOrderCounters

} from "@/db/schema";



import {

  sendButtons,

  sendMenu,

  sendRestaurantList,

  sendText

} from "@/lib/whatsapp";



import {

  getSession,

  saveSession,

  resetSession,

  CartItem

} from "@/lib/whatsapp-session";



import {

  getIndiaDateParts,

  formatOrderNumber,

  money

} from "@/lib/utils";



export async function GET(

  request: Request

) {

  const { searchParams } =

    new URL(request.url);



  const mode =

    searchParams.get("hub.mode");



  const token =

    searchParams.get(

      "hub.verify_token"

    );



  const challenge =

    searchParams.get(

      "hub.challenge"

    );



  if (

    mode === "subscribe" &&

    token ===

      process.env.WHATSAPP_VERIFY_TOKEN

  ) {

    return new Response(

      challenge

    );

  }



  return new Response(

    "Forbidden",

    {

      status: 403

    }

  );

}



function cartTotal(

  cart: CartItem[]

) {

  return cart.reduce(

    (total, item) =>

      total +

      item.price *

        item.quantity,

    0

  );

}



function formatCart(

  cart: CartItem[]

) {

  return cart

    .map(

      (item) =>

        `${item.quantity} × ${item.name} — ${money(

          item.price *

            item.quantity

        )}`

    )

    .join("\n");

}



async function showRestaurants(

  phone: string

) {

  const available =

    await db

      .select({

        id: restaurants.id,

        name: restaurants.name

      })

      .from(restaurants)

      .where(

        eq(

          restaurants.isOpen,

          true

        )

      )

      .orderBy(

        asc(restaurants.name)

      );



  if (

    available.length === 0

  ) {

    await sendText(

      phone,

      "There are no restaurants available right now. Check back soon."

    );



    return;

  }



  await sendRestaurantList(

    phone,

    available

  );

}



async function showRestaurantMenu(

  phone: string,

  restaurantId: number

) {

  const restaurantRows =

    await db

      .select()

      .from(restaurants)

      .where(

        and(

          eq(

            restaurants.id,

            restaurantId

          ),

          eq(

            restaurants.isOpen,

            true

          )

        )

      )

      .limit(1);



  const restaurant =

    restaurantRows[0];



  if (!restaurant) {

    await sendText(

      phone,

      "That restaurant is currently unavailable."

    );



    return;

  }



  const items =

    await db

      .select({

        id: menuItems.id,

        name: menuItems.name,

        price: menuItems.price

      })

      .from(menuItems)

      .where(

        and(

          eq(

            menuItems.restaurantId,

            restaurantId

          ),

          eq(

            menuItems.isAvailable,

            true

          )

        )

      )

      .orderBy(

        asc(menuItems.name)

      );



  if (items.length === 0) {

    await sendText(

      phone,

      `${restaurant.name} hasn't added any available menu items yet.`

    );



    return;

  }



  await sendMenu(

    phone,

    restaurant.name,

    items

  );

}



export async function POST(

  request: Request

) {

  try {

    const payload =

      await request.json();



    const value =

      payload?.entry?.[0]

        ?.changes?.[0]

        ?.value;



    const message =

      value?.messages?.[0];



    if (!message) {

      return NextResponse.json({

        received: true

      });

    }



    const phone =

      message.from;



    if (!phone) {

      return NextResponse.json({

        received: true

      });

    }



    const session =

      await getSession(phone);



    const interactiveId =

      message?.interactive

        ?.button_reply?.id ||

      message?.interactive

        ?.list_reply?.id;



    const text =

      message?.text?.body?.trim();



    const lowerText =

      text?.toLowerCase();



    /*

     * GLOBAL RESTART

     */



    if (

      lowerText === "hi" ||

      lowerText === "hello" ||

      lowerText === "start" ||

      lowerText === "restart"

    ) {

      await resetSession(

        phone

      );



      await sendButtons(

        phone,

        "Welcome to OffMenu.\n\nOrder directly from local restaurants without unnecessary platform fees.",

        [

          {

            id: "browse_restaurants",

            title: "Order Now"

          }

        ]

      );



      return NextResponse.json({

        received: true

      });

    }



    /*

     * ORDER NOW

     */



    if (

      interactiveId ===

        "browse_restaurants" ||

      interactiveId ===

        "order_now"

    ) {

      session.state =

        "CHOOSING_RESTAURANT";



      session.restaurantId =

        null;



      session.cart = [];



      session.customerNote =

        null;



      session.deliveryAddress =

        null;



      await saveSession(

        session

      );



      await showRestaurants(

        phone

      );



      return NextResponse.json({

        received: true

      });

    }



    /*

     * RESTAURANT SELECTED

     */



    if (

      interactiveId?.startsWith(

        "restaurant_"

      )

    ) {

      const restaurantId =

        Number(

          interactiveId.replace(

            "restaurant_",

            ""

          )

        );



      if (

        !Number.isInteger(

          restaurantId

        )

      ) {

        await sendText(

          phone,

          "That restaurant selection is invalid. Please start again."

        );



        return NextResponse.json({

          received: true

        });

      }



      const restaurantRows =

        await db

          .select()

          .from(restaurants)

          .where(

            and(

              eq(

                restaurants.id,

                restaurantId

              ),

              eq(

                restaurants.isOpen,

                true

              )

            )

          )

          .limit(1);



      const restaurant =

        restaurantRows[0];



      if (!restaurant) {

        await sendText(

          phone,

          "That restaurant is currently unavailable."

        );



        return NextResponse.json({

          received: true

        });

      }



      session.restaurantId =

        restaurantId;



      session.cart = [];



      session.customerNote =

        null;



      session.deliveryAddress =

        null;



      session.state =

        "CHOOSING_ITEM";



      await saveSession(

        session

      );



      await showRestaurantMenu(

        phone,

        restaurantId

      );



      return NextResponse.json({

        received: true

      });

    }



    /*

     * ITEM SELECTED

     */



    if (

      interactiveId?.startsWith(

        "item_"

      )

    ) {

      const itemId =

        Number(

          interactiveId.replace(

            "item_",

            ""

          )

        );



      if (

        !Number.isInteger(

          itemId

        )

      ) {

        await sendText(

          phone,

          "That menu item selection is invalid. Please start again."

        );



        return NextResponse.json({

          received: true

        });

      }



      if (

        !session.restaurantId

      ) {

        await sendText(

          phone,

          "Please choose a restaurant first."

        );



        await showRestaurants(

          phone

        );



        return NextResponse.json({

          received: true

        });

      }



      const itemRows =

        await db

          .select({

            id: menuItems.id,

            restaurantId:

              menuItems.restaurantId,

            name: menuItems.name,

            price: menuItems.price,

            isAvailable:

              menuItems.isAvailable

          })

          .from(menuItems)

          .where(

            and(

              eq(

                menuItems.id,

                itemId

              ),

              eq(

                menuItems.restaurantId,

                session.restaurantId

              ),

              eq(

                menuItems.isAvailable,

                true

              )

            )

          )

          .limit(1);



      const item =

        itemRows[0];



      if (!item) {

        await sendText(

          phone,

          "That item is no longer available. Please choose another item."

        );



        await showRestaurantMenu(

          phone,

          session.restaurantId

        );



        return NextResponse.json({

          received: true

        });

      }



      const existing =

        session.cart.find(

          (cartItem) =>

            cartItem.menuItemId ===

            item.id

        );



      if (existing) {

        existing.quantity += 1;



        existing.price =

          item.price;



        existing.name =

          item.name;

      } else {

        session.cart.push({

          menuItemId:

            item.id,



          name:

            item.name,



          price:

            item.price,



          quantity: 1

        });

      }



      session.state =

        "CART";



      await saveSession(

        session

      );



      const total =

        cartTotal(

          session.cart

        );



      await sendButtons(

        phone,

        `Added ${item.name} to your cart.\n\n${formatCart(

          session.cart

        )}\n\nTotal: ${money(

          total

        )}`,

        [

          {

            id: "add_more",

            title: "Add More"

          },

          {

            id: "checkout",

            title: "Checkout"

          },

          {

            id: "clear_cart",

            title: "Clear"

          }

        ]

      );



      return NextResponse.json({

        received: true

      });

    }



    /*

     * ADD MORE

     */



    if (

      interactiveId ===

      "add_more"

    ) {

      if (

        !session.restaurantId

      ) {

        await showRestaurants(

          phone

        );



        return NextResponse.json({

          received: true

        });

      }



      session.state =

        "CHOOSING_ITEM";



      await saveSession(

        session

      );



      await showRestaurantMenu(

        phone,

        session.restaurantId

      );



      return NextResponse.json({

        received: true

      });

    }



    /*

     * CLEAR CART

     */



    if (

      interactiveId ===

      "clear_cart"

    ) {

      session.cart = [];



      session.state =

        "CHOOSING_ITEM";



      session.customerNote =

        null;



      session.deliveryAddress =

        null;



      await saveSession(

        session

      );



      if (

        session.restaurantId

      ) {

        await showRestaurantMenu(

          phone,

          session.restaurantId

        );

      } else {

        await showRestaurants(

          phone

        );

      }



      return NextResponse.json({

        received: true

      });

    }



    /*

     * CHECKOUT

     */



    if (

      interactiveId ===

      "checkout"

    ) {

      if (

        session.cart.length ===

        0

      ) {

        await sendText(

          phone,

          "Your cart is empty."

        );



        return NextResponse.json({

          received: true

        });

      }



      if (

        !session.restaurantId

      ) {

        await sendText(

          phone,

          "Please choose a restaurant before checking out."

        );



        await showRestaurants(

          phone

        );



        return NextResponse.json({

          received: true

        });

      }



      const restaurantRows =

        await db

          .select({

            id: restaurants.id,

            name: restaurants.name,

            isOpen:

              restaurants.isOpen

          })

          .from(restaurants)

          .where(

            eq(

              restaurants.id,

              session.restaurantId

            )

          )

          .limit(1);



      const restaurant =

        restaurantRows[0];



      if (

        !restaurant ||

        !restaurant.isOpen

      ) {

        await sendText(

          phone,

          "Sorry, that restaurant is currently closed."

        );



        await resetSession(

          phone

        );



        return NextResponse.json({

          received: true

        });

      }



      session.state =

        "WAITING_FOR_NOTE";



      await saveSession(

        session

      );



      await sendText(

        phone,

        `Your cart:\n\n${formatCart(

          session.cart

        )}\n\nTotal: ${money(

          cartTotal(

            session.cart

          )

        )}\n\nAdd a note for the restaurant, or reply SKIP if you don't have one.`

      );



      return NextResponse.json({

        received: true

      });

    }



    /*

     * CUSTOMER NOTE

     */



    if (

      session.state ===

      "WAITING_FOR_NOTE"

    ) {

      session.customerNote =

        lowerText === "skip"

          ? null

          : text || null;



      session.state =

        "WAITING_FOR_ADDRESS";



      await saveSession(

        session

      );



      await sendText(

        phone,

        "Great. Now send your complete delivery address.\n\nPlease include house/building number, street, area and any useful landmark."

      );



      return NextResponse.json({

        received: true

      });

    }



    /*

     * DELIVERY ADDRESS

     */



    if (

      session.state ===

      "WAITING_FOR_ADDRESS"

    ) {

      if (

        !text ||

        text.length < 8

      ) {

        await sendText(

          phone,

          "Please send a complete delivery address so the restaurant can deliver your order."

        );



        return NextResponse.json({

          received: true

        });

      }



      if (

        !session.restaurantId

      ) {

        await sendText(

          phone,

          "Something went wrong with your restaurant selection. Please start again."

        );



        await resetSession(

          phone

        );



        return NextResponse.json({

          received: true

        });

      }



      const restaurantRows =

        await db

          .select({

            id: restaurants.id,

            name: restaurants.name,

            isOpen:

              restaurants.isOpen

          })

          .from(restaurants)

          .where(

            eq(

              restaurants.id,

              session.restaurantId

            )

          )

          .limit(1);



      const restaurant =

        restaurantRows[0];



      if (

        !restaurant ||

        !restaurant.isOpen

      ) {

        await sendText(

          phone,

          "Sorry, that restaurant is currently closed."

        );



        await resetSession(

          phone

        );



        return NextResponse.json({

          received: true

        });

      }



      session.deliveryAddress =

        text;



      session.state =

        "WAITING_FOR_CONFIRMATION";



      await saveSession(

        session

      );



      const subtotal =

        cartTotal(

          session.cart

        );



      await sendButtons(

        phone,

        `Please confirm your order.\n\n${formatCart(

          session.cart

        )}\n\nFood total: ${money(

          subtotal

        )}\nPayment: Cash or UPI directly to the restaurant.\n\nDelivery address:\n${session.deliveryAddress}`,

        [

          {

            id: "confirm_order",

            title: "Confirm Order"

          },

          {

            id: "cancel_order",

            title: "Cancel"

          }

        ]

      );



      return NextResponse.json({

        received: true

      });

    }



    /*

     * CONFIRM ORDER

     */



    if (

      interactiveId ===

      "confirm_order"

    ) {

      if (

        !session.restaurantId ||

        session.cart.length ===

          0 ||

        !session.deliveryAddress

      ) {

        await sendText(

          phone,

          "Something went wrong with your cart. Please start again."

        );



        await resetSession(

          phone

        );



        return NextResponse.json({

          received: true

        });

      }



      /*

       * Re-check the restaurant.

       */



      const restaurantRows =

        await db

          .select()

          .from(restaurants)

          .where(

            eq(

              restaurants.id,

              session.restaurantId

            )

          )

          .limit(1);



      const restaurant =

        restaurantRows[0];



      if (!restaurant) {

        await sendText(

          phone,

          "That restaurant is no longer available."

        );



        await resetSession(

          phone

        );



        return NextResponse.json({

          received: true

        });

      }



      if (

        !restaurant.isOpen

      ) {

        await sendText(

          phone,

          `Sorry, ${restaurant.name} is currently closed. Your order was not placed.`

        );



        await resetSession(

          phone

        );



        return NextResponse.json({

          received: true

        });

      }



      /*

       * Re-check every cart item

       * against the database.

       *

       * We do not trust the price/name

       * stored in the WhatsApp session

       * because the menu may have changed

       * while the customer was checking out.

       */



      const cartItemIds =

        session.cart.map(

          (item) =>

            item.menuItemId

        );



      const currentItems =

        await db

          .select({

            id: menuItems.id,

            restaurantId:

              menuItems.restaurantId,

            name: menuItems.name,

            price: menuItems.price,

            isAvailable:

              menuItems.isAvailable

          })

          .from(menuItems)

          .where(

            and(

              eq(

                menuItems.restaurantId,

                restaurant.id

              ),

              inArray(

                menuItems.id,

                cartItemIds

              )

            )

          );



      const currentItemMap =

        new Map(

          currentItems.map(

            (item) => [

              item.id,

              item

            ]

          )

        );



      const unavailableItems: string[] =

        [];



      for (

        const cartItem of

        session.cart

      ) {

        const currentItem =

          currentItemMap.get(

            cartItem.menuItemId

          );



        if (

          !currentItem ||

          !currentItem.isAvailable

        ) {

          unavailableItems.push(

            cartItem.name

          );

        }

      }



      if (

        unavailableItems.length >

        0

      ) {

        await sendText(

          phone,

          `Sorry, these items are no longer available:\n\n${unavailableItems

            .map(

              (name) =>

                `• ${name}`

            )

            .join(

              "\n"

            )}\n\nYour order was not placed. Please start again.`

        );



        await resetSession(

          phone

        );



        return NextResponse.json({

          received: true

        });

      }



      /*

       * Rebuild the cart using

       * current database prices.

       */



      const verifiedCart: CartItem[] =

        session.cart.map(

          (cartItem) => {

            const currentItem =

              currentItemMap.get(

                cartItem.menuItemId

              )!;



            return {

              menuItemId:

                currentItem.id,



              name:

                currentItem.name,



              price:

                currentItem.price,



              quantity:

                cartItem.quantity

            };

          }

        );



      const subtotal =

        cartTotal(

          verifiedCart

        );



      /*

       * The customer does NOT pay

       * the platform fee.

       *

       * total = food subtotal

       * platformFee = amount restaurant

       * owes OffMenu.

       */



      const platformFee =

        30;



      /*
       * Create the order and
       * its items together.
       *
       * The counter is scoped to:
       *
       * restaurant + India calendar day.
       *
       * This makes order numbers:
       *
       * #RRRDDMMYYNNN
       *
       * and resets the sequence for
       * each restaurant every day.
       */

      const {
        dateKey,
        dateCode
      } = getIndiaDateParts();



      const createdOrder =

        await db.transaction(

          async (tx) => {

            const counterRows =

              await tx

                .insert(
                  restaurantDailyOrderCounters
                )

                .values({

                  restaurantId:
                    restaurant.id,

                  orderDate:
                    dateKey,

                  orderCount:
                    1

                })

                .onConflictDoUpdate({

                  target: [

                    restaurantDailyOrderCounters.restaurantId,

                    restaurantDailyOrderCounters.orderDate

                  ],

                  set: {

                    orderCount:
                      sql`${restaurantDailyOrderCounters.orderCount} + 1`

                  }

                })

                .returning({

                  orderCount:
                    restaurantDailyOrderCounters.orderCount

                });



            const counter =
              counterRows[0];



            if (!counter) {

              throw new Error(

                "Order counter update failed."

              );

            }



            const orderNumber =

              formatOrderNumber(

                restaurant.id,

                dateCode,

                counter.orderCount

              );



            const createdOrders =

              await tx

                .insert(orders)

                .values({

                  orderNumber,

                  restaurantId:

                    restaurant.id,



                  customerPhone:

                    phone,



                  deliveryAddress:

                    session.deliveryAddress!,



                  customerNote:

                    session.customerNote,



                  subtotal,



                  platformFee,



                  total:

                    subtotal,



                  paymentMethod:

                    "COD_OR_UPI",



                  /*

                   * The order is NOT

                   * confirmed yet.

                   *

                   * Restaurant must

                   * accept it first.

                   */

                  status:

                    "NEW"

                })

                .returning();



            const order =

              createdOrders[0];



            if (!order) {

              throw new Error(

                "Order creation failed."

              );

            }



            for (

              const item of

              verifiedCart

            ) {

              await tx

                .insert(orderItems)

                .values({

                  orderId:

                    order.id,



                  menuItemId:

                    item.menuItemId,



                  itemName:

                    item.name,



                  quantity:

                    item.quantity,



                  unitPrice:

                    item.price,



                  note:

                    null,



                  total:

                    item.price *

                    item.quantity

                });

            }



            return order;

          }

        );



      const orderNumber =
        createdOrder.orderNumber;



      const restaurantPhone =

        restaurant.whatsapp ||

        restaurant.phone;



      const restaurantMessage =

        `🔔 NEW OFFMENU ORDER\n\n` +

        `Order: ${orderNumber}\n\n` +

        `${formatCart(

          verifiedCart

        )}\n\n` +

        `Total to collect: ${money(

          subtotal

        )}\n` +

        `Payment: Cash / UPI\n\n` +

        `Customer WhatsApp: ${phone}\n\n` +

        `Delivery address:\n${session.deliveryAddress}` +

        (session.customerNote

          ? `\n\nCustomer note:\n${session.customerNote}`

          : "");



      /*

       * Restaurant notification is

       * best-effort.

       *

       * If WhatsApp notification fails,

       * the order remains safely stored

       * in Turso and visible in the

       * restaurant panel.

       */



      try {

        await sendText(

          restaurantPhone,

          restaurantMessage

        );

      } catch (

        notificationError

      ) {

        console.error(

          "Restaurant WhatsApp notification failed:",

          notificationError

        );

      }



      /*

       * IMPORTANT:

       *

       * This is NOT ORDER CONFIRMED.

       *

       * The restaurant must accept

       * the order from its OffMenu

       * dashboard first.

       */



      await sendText(

        phone,

        `📦 ORDER RECEIVED\n\n` +

          `Order: ${orderNumber}\n` +

          `Restaurant: ${restaurant.name}\n\n` +

          `${formatCart(

            verifiedCart

          )}\n\n` +

          `Total: ${money(

            subtotal

          )}\n` +

          `Payment: Cash or UPI directly to the restaurant.\n\n` +

          `Your order has been sent to the restaurant.\n` +

          `You'll receive a confirmation once the restaurant accepts it.`

      );



      await sendButtons(

        phone,

        `Your order #${orderNumber} is waiting for restaurant acceptance.`,

        [

          {

            id: "new_order",

            title: "New Order"

          }

        ]

      );



      await resetSession(

        phone

      );



      return NextResponse.json({

        received: true,

        orderNumber:

          createdOrder.orderNumber

      });

    }



    /*

     * CANCEL ORDER

     */



    if (

      interactiveId ===

      "cancel_order"

    ) {

      await resetSession(

        phone

      );



      await sendText(

        phone,

        "Order cancelled.\n\nWhenever you're hungry, just send HI."

      );



      return NextResponse.json({

        received: true

      });

    }



    /*

     * NEW ORDER

     */



    if (

      interactiveId ===

      "new_order"

    ) {

      await resetSession(

        phone

      );



      await showRestaurants(

        phone

      );



      return NextResponse.json({

        received: true

      });

    }



    /*

     * FALLBACK

     */



    await sendButtons(

      phone,

      "I didn't understand that.\n\nStart a new order below.",

      [

        {

          id: "browse_restaurants",

          title: "Order Now"

        }

      ]

    );



    return NextResponse.json({

      received: true

    });

  } catch (error) {

    console.error(

      "WhatsApp webhook error:",

      error

    );



    return NextResponse.json(

      {

        error:

          "Webhook failed"

      },

      {

        status: 500

      }

    );

  }

}