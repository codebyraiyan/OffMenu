export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="container flex min-h-screen flex-col justify-center py-20">
        <div className="max-w-3xl">
          <p className="mb-6 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            OFFMENU
          </p>

          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
            Food from your
            <br />
            local restaurants.
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-8 text-neutral-600">
            Order directly from restaurants through WhatsApp.
            No unnecessary delivery platform fees. No complicated
            app. Just food from the people who make it.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href={
                process.env.NEXT_PUBLIC_WHATSAPP_LINK ||
                "#"
              }
              className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              Order on WhatsApp
            </a>

            <a
              href="/admin"
              className="rounded-full border border-neutral-300 bg-white px-6 py-3 text-sm font-medium hover:bg-neutral-50"
            >
              Restaurant Admin
            </a>
          </div>
        </div>

        <div className="mt-20 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            [
              "01",
              "Choose",
              "Pick a restaurant and browse its menu."
            ],
            [
              "02",
              "Order",
              "Send your order and delivery address."
            ],
            [
              "03",
              "Delivered",
              "The restaurant prepares and delivers it."
            ]
          ].map(([number, title, description]) => (
            <div
              key={number}
              className="rounded-2xl border border-neutral-200 bg-white p-6"
            >
              <span className="text-xs text-neutral-400">
                {number}
              </span>

              <h2 className="mt-8 text-lg font-medium">
                {title}
              </h2>

              <p className="mt-2 text-sm leading-6 text-neutral-500">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}