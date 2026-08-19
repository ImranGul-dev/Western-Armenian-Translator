import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";


type AnyRecord =
  Record<string, unknown>;


function record(
  value: unknown,
): AnyRecord {
  return value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ? value as AnyRecord
    : {};
}


function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}


function integerValue(
  value: unknown,
): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}


function isoValue(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}


function json(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(
    body,
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store",
        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}


function toBase64(
  bytes: Uint8Array,
): string {
  let binary = "";

  for (
    const byte of bytes
  ) {
    binary +=
      String.fromCharCode(
        byte,
      );
  }

  return btoa(binary);
}


function constantTimeEqual(
  left: string,
  right: string,
): boolean {
  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  let difference = 0;

  for (
    let index = 0;
    index < left.length;
    index += 1
  ) {
    difference |=
      left.charCodeAt(index) ^
      right.charCodeAt(index);
  }

  return difference === 0;
}


async function validSignature(
  rawBody: string,
  suppliedSignature: string,
  secret: string,
): Promise<boolean> {
  if (
    !suppliedSignature ||
    !secret
  ) {
    return false;
  }

  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder()
        .encode(secret),
      {
        name:
          "HMAC",
        hash:
          "SHA-256",
      },
      false,
      [
        "sign",
      ],
    );

  const digest =
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder()
        .encode(rawBody),
    );

  const expected =
    toBase64(
      new Uint8Array(
        digest,
      ),
    );

  return constantTimeEqual(
    expected,
    suppliedSignature.trim(),
  );
}


function metadataUserId(
  payload: AnyRecord,
): string {
  const meta =
    Array.isArray(
      payload.meta_data,
    )
      ? payload.meta_data
      : [];

  for (
    const item of meta
  ) {
    const row =
      record(item);

    const key =
      stringValue(
        row.key,
      );

    if (
      key ===
        "tun_user_id" ||
      key ===
        "_tun_user_id" ||
      key ===
        "supabase_user_id"
    ) {
      return stringValue(
        row.value,
      );
    }
  }

  return "";
}


function billingEmail(
  payload: AnyRecord,
): string {
  const billing =
    record(
      payload.billing,
    );

  return stringValue(
    billing.email,
  )
    .toLowerCase();
}


function productIds(
  payload: AnyRecord,
): number[] {
  const items =
    Array.isArray(
      payload.line_items,
    )
      ? payload.line_items
      : [];

  const result:
    number[] = [];

  for (
    const item of items
  ) {
    const row =
      record(item);

    const productId =
      integerValue(
        row.product_id,
      );

    const variationId =
      integerValue(
        row.variation_id,
      );

    if (
      productId &&
      !result.includes(
        productId,
      )
    ) {
      result.push(
        productId,
      );
    }

    if (
      variationId &&
      !result.includes(
        variationId,
      )
    ) {
      result.push(
        variationId,
      );
    }
  }

  return result;
}


async function resolveUserId(
  admin: SupabaseClient,
  payload: AnyRecord,
): Promise<string | null> {
  const linkedUserId =
    metadataUserId(
      payload,
    );

  if (linkedUserId) {
    const result =
      await admin
        .from("profiles")
        .select("id")
        .eq(
          "id",
          linkedUserId,
        )
        .maybeSingle();

    if (
      !result.error &&
      typeof result.data?.id ===
        "string"
    ) {
      return result
        .data
        .id;
    }
  }

  const email =
    billingEmail(
      payload,
    );

  if (!email) {
    return null;
  }

  const result =
    await admin
      .from("profiles")
      .select("id")
      .ilike(
        "email",
        email,
      )
      .limit(2);

  if (
    result.error ||
    !Array.isArray(
      result.data,
    ) ||
    result.data.length !== 1
  ) {
    return null;
  }

  return typeof result.data[0]
      ?.id === "string"
    ? result.data[0].id
    : null;
}


async function resolvePlan(
  admin: SupabaseClient,
  payload: AnyRecord,
): Promise<{
  planId: string;
  planSlug:
    "premium" |
    "business";
  productId: number;
} | null> {
  for (
    const productId of
      productIds(payload)
  ) {
    const result =
      await admin
        .from(
          "woocommerce_product_plan_map",
        )
        .select(
          "plan_id,plan_slug,product_id",
        )
        .eq(
          "product_id",
          productId,
        )
        .eq(
          "active",
          true,
        )
        .maybeSingle();

    if (
      result.error ||
      !result.data
    ) {
      continue;
    }

    if (
      typeof result.data
          .plan_id ===
        "string" &&
      (
        result.data
          .plan_slug ===
          "premium" ||
        result.data
          .plan_slug ===
          "business"
      )
    ) {
      return {
        planId:
          result.data.plan_id,
        planSlug:
          result.data.plan_slug,
        productId,
      };
    }
  }

  return null;
}


async function freePlanId(
  admin: SupabaseClient,
): Promise<string | null> {
  const result =
    await admin
      .from("plans")
      .select("id")
      .eq(
        "slug",
        "free",
      )
      .maybeSingle();

  return typeof result.data?.id ===
      "string"
    ? result.data.id
    : null;
}


async function markEvent(
  admin: SupabaseClient,
  eventId: string,
  values: Record<string, unknown>,
) {
  await admin
    .from(
      "woocommerce_webhook_events",
    )
    .update(values)
    .eq(
      "event_id",
      eventId,
    );
}


Deno.serve(
  async (
    request: Request,
  ): Promise<Response> => {
    if (
      request.method !==
      "POST"
    ) {
      return new Response(
        "Method not allowed",
        {
          status:
            405,
        },
      );
    }

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      )?.trim() ||
      "";

    const adminKey =
      (
        Deno.env.get(
          "SUPABASE_SECRET_KEY",
        ) ||
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY",
        ) ||
        ""
      ).trim();

    const webhookSecret =
      Deno.env.get(
        "WOOCOMMERCE_WEBHOOK_SECRET",
      )?.trim() ||
      "";

    if (
      !supabaseUrl ||
      !adminKey ||
      !webhookSecret
    ) {
      return new Response(
        "WooCommerce webhook is not configured",
        {
          status:
            503,
        },
      );
    }

    const rawBody =
      await request.text();

    const signature =
      request.headers.get(
        "x-wc-webhook-signature",
      ) ||
      "";

    if (
      !await validSignature(
        rawBody,
        signature,
        webhookSecret,
      )
    ) {
      return new Response(
        "Invalid webhook signature",
        {
          status:
            401,
        },
      );
    }

    let payload:
      AnyRecord;

    try {
      payload =
        record(
          JSON.parse(
            rawBody ||
            "{}",
          ),
        );
    } catch {
      return new Response(
        "Invalid JSON",
        {
          status:
            400,
        },
      );
    }

    const admin =
      createClient(
        supabaseUrl,
        adminKey,
        {
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        },
      );

    const subscriptionId =
      integerValue(
        payload.id,
      );

    const webhookId =
      request.headers.get(
        "x-wc-webhook-id",
      ) ||
      "unknown";

    const deliveryId =
      request.headers.get(
        "x-wc-webhook-delivery-id",
      ) ||
      crypto.randomUUID();

    const topic =
      request.headers.get(
        "x-wc-webhook-topic",
      ) ||
      "unknown";

    const eventId =
      `${webhookId}:${deliveryId}`;

    const existing =
      await admin
        .from(
          "woocommerce_webhook_events",
        )
        .select(
          "processing_status",
        )
        .eq(
          "event_id",
          eventId,
        )
        .maybeSingle();

    if (
      existing.data
        ?.processing_status ===
      "completed"
    ) {
      return json({
        received:
          true,
        duplicate:
          true,
      });
    }

    const eventType =
      stringValue(
        payload.status,
      ) ||
      stringValue(
        request.headers.get(
          "x-wc-webhook-event",
        ),
      ) ||
      "unknown";

    const lockResult =
      await admin
        .from(
          "woocommerce_webhook_events",
        )
        .upsert(
          {
            event_id:
              eventId,
            event_type:
              eventType,
            topic,
            woocommerce_subscription_id:
              subscriptionId,
            processing_status:
              "processing",
            last_error:
              null,
            safe_summary: {
              source:
                request.headers.get(
                  "x-wc-webhook-source",
                ) ||
                null,
              resource:
                request.headers.get(
                  "x-wc-webhook-resource",
                ) ||
                null,
            },
            processed_at:
              null,
          },
          {
            onConflict:
              "event_id",
          },
        );

    if (lockResult.error) {
      return new Response(
        "Could not record webhook event",
        {
          status:
            500,
        },
      );
    }

    // WooCommerce sends a ping when a webhook is first created. Accept it so
    // WooCommerce does not count the configuration test as a failure.
    if (!subscriptionId) {
      await markEvent(
        admin,
        eventId,
        {
          processing_status:
            "ignored",
          processed_at:
            new Date()
              .toISOString(),
          safe_summary: {
            reason:
              "No subscription resource in payload",
          },
        },
      );

      return json({
        received:
          true,
        ignored:
          true,
      });
    }

    try {
      const [
        userId,
        plan,
      ] =
        await Promise.all([
          resolveUserId(
            admin,
            payload,
          ),
          resolvePlan(
            admin,
            payload,
          ),
        ]);

      if (
        !userId ||
        !plan
      ) {
        await markEvent(
          admin,
          eventId,
          {
            processing_status:
              "unmatched",
            processed_at:
              new Date()
                .toISOString(),
            safe_summary: {
              woocommerce_subscription_id:
                subscriptionId,
              customer_id:
                integerValue(
                  payload.customer_id,
                ),
              product_ids:
                productIds(payload),
              billing_email_present:
                Boolean(
                  billingEmail(
                    payload,
                  ),
                ),
              matched_user:
                Boolean(userId),
              matched_plan:
                Boolean(plan),
            },
          },
        );

        // Return 2xx so WooCommerce keeps the webhook active. The unmatched
        // event stays visible in the database for safe manual reconciliation.
        return json({
          received:
            true,
          matched:
            false,
        });
      }

      const status =
        stringValue(
          payload.status,
        )
          .toLowerCase()
          .replace(
            /_/gu,
            "-",
          );

      const active =
        status ===
        "active";

      const parentId =
        integerValue(
          payload.parent_id,
        );

      const customerId =
        integerValue(
          payload.customer_id,
        );

      const email =
        billingEmail(
          payload,
        );

      const existingSubscription =
        await admin
          .from(
            "subscriptions",
          )
          .select(
            "access_suspended,access_suspended_reason",
          )
          .eq(
            "user_id",
            userId,
          )
          .maybeSingle();

      const now =
        new Date()
          .toISOString();

      const nextPaymentAt =
        isoValue(
          record(
            payload.billing_period,
          ).next_payment,
        ) ||
        isoValue(
          record(
            payload.schedule,
          ).next_payment,
        ) ||
        isoValue(
          payload.next_payment_date,
        );

      const endAt =
        isoValue(
          record(
            payload.schedule,
          ).end,
        ) ||
        isoValue(
          payload.end_date,
        );

      const subscriptionResult =
        await admin
          .from(
            "subscriptions",
          )
          .upsert(
            {
              user_id:
                userId,
              plan_id:
                plan.planId,
              plan_slug:
                plan.planSlug,
              billing_provider:
                "woocommerce",
              status:
                status ||
                "inactive",
              woocommerce_subscription_id:
                subscriptionId,
              woocommerce_order_id:
                parentId,
              woocommerce_customer_id:
                customerId,
              woocommerce_product_id:
                plan.productId,
              woocommerce_billing_email:
                email ||
                null,
              cancel_at_period_end:
                status ===
                "pending-cancel",
              next_payment_at:
                nextPaymentAt,
              ended_at:
                status ===
                  "cancelled" ||
                status ===
                  "expired"
                  ? endAt ||
                    now
                  : endAt,
              access_suspended:
                existingSubscription
                  .data
                  ?.access_suspended ===
                  true,
              access_suspended_reason:
                existingSubscription
                  .data
                  ?.access_suspended_reason ||
                null,
              provider_updated_at:
                isoValue(
                  payload.date_modified_gmt,
                ) ||
                isoValue(
                  payload.date_modified,
                ) ||
                now,
              synced_at:
                now,
              metadata: {
                webhook_topic:
                  topic,
                wc_status:
                  status,
                payment_method:
                  stringValue(
                    payload.payment_method,
                  ) ||
                  null,
              },
            },
            {
              onConflict:
                "user_id",
            },
          );

      if (subscriptionResult.error) {
        throw subscriptionResult
          .error;
      }

      const targetPlanId =
        active
          ? plan.planId
          : await freePlanId(
              admin,
            );

      if (targetPlanId) {
        const profileResult =
          await admin
            .from(
              "profiles",
            )
            .update({
              current_plan_id:
                targetPlanId,
            })
            .eq(
              "id",
              userId,
            );

        if (profileResult.error) {
          throw profileResult
            .error;
        }
      }

      await markEvent(
        admin,
        eventId,
        {
          processing_status:
            "completed",
          processed_at:
            now,
          last_error:
            null,
          safe_summary: {
            woocommerce_subscription_id:
              subscriptionId,
            user_id:
              userId,
            plan_slug:
              plan.planSlug,
            product_id:
              plan.productId,
            status,
            paid_access:
              active,
          },
        },
      );

      return json({
        received:
          true,
        matched:
          true,
        paidAccess:
          active,
      });
    } catch (error) {
      const safeMessage =
        error instanceof Error
          ? error.message
              .slice(
                0,
                500,
              )
          : "Verified WooCommerce webhook processing failed.";

      await markEvent(
        admin,
        eventId,
        {
          processing_status:
            "failed",
          last_error:
            safeMessage,
        },
      );

      await admin
        .from(
          "system_errors",
        )
        .insert({
          error_code:
            "woocommerce_webhook_processing",
          safe_message:
            "A verified WooCommerce subscription event could not be processed.",
          function_name:
            "woocommerce-webhook",
        });

      return new Response(
        "Processing failed",
        {
          status:
            500,
        },
      );
    }
  },
);
