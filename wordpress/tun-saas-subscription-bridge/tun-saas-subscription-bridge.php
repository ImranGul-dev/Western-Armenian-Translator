<?php
/**
 * Plugin Name: Tun SaaS Subscription Bridge
 * Description: Carries Tun's short-lived checkout token onto WooCommerce orders and subscriptions so the SaaS account can be linked securely by the signed subscription webhook.
 * Version: 1.0.2
 * Author: Tun
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

const TUN_SAAS_CHECKOUT_QUERY_KEY = 'tun_checkout';
const TUN_SAAS_CHECKOUT_META_KEY  = '_tun_checkout_token';

function tun_saas_mapped_product_ids() {
    return array( 13793, 13794 );
}

function tun_saas_clean_checkout_token( $value ) {
    $value = is_string( $value ) ? strtolower( trim( wp_unslash( $value ) ) ) : '';
    return preg_match( '/^[a-f0-9]{64}$/', $value ) ? $value : '';
}

function tun_saas_active_checkout_token() {
    if ( ! function_exists( 'WC' ) || ! WC()->session ) {
        return '';
    }

    return tun_saas_clean_checkout_token( WC()->session->get( TUN_SAAS_CHECKOUT_META_KEY ) );
}

function tun_saas_is_mapped_product( $product_id, $variation_id = 0 ) {
    $mapped = tun_saas_mapped_product_ids();
    return in_array( absint( $product_id ), $mapped, true ) ||
        in_array( absint( $variation_id ), $mapped, true );
}

/**
 * Capture Tun's opaque checkout token early in the request. The token is kept
 * in the WooCommerce session until an order is completed.
 */
function tun_saas_capture_checkout_token() {
    if ( ! function_exists( 'WC' ) || ! WC()->session ) {
        return;
    }

    if ( ! isset( $_GET[ TUN_SAAS_CHECKOUT_QUERY_KEY ] ) ) {
        return;
    }

    $token = tun_saas_clean_checkout_token( $_GET[ TUN_SAAS_CHECKOUT_QUERY_KEY ] );
    if ( $token ) {
        WC()->session->set( TUN_SAAS_CHECKOUT_META_KEY, $token );
    }
}
add_action( 'wp_loaded', 'tun_saas_capture_checkout_token', 12 );

/**
 * Immediately before WooCommerce adds one of Tun's SaaS products, remove any
 * existing mapped SaaS plan from the cart. This is deliberately done in the
 * add-to-cart validation path because the cart is fully loaded there, and it
 * remains reliable even when another theme/plugin also processes add-to-cart.
 */
function tun_saas_prepare_plan_add_to_cart( $passed, $product_id, $quantity, $variation_id = 0, $variation = array() ) {
    if ( ! $passed || ! tun_saas_active_checkout_token() || ! tun_saas_is_mapped_product( $product_id, $variation_id ) ) {
        return $passed;
    }

    if ( function_exists( 'WC' ) && WC()->cart ) {
        foreach ( WC()->cart->get_cart() as $cart_item_key => $cart_item ) {
            $cart_product_id   = isset( $cart_item['product_id'] ) ? absint( $cart_item['product_id'] ) : 0;
            $cart_variation_id = isset( $cart_item['variation_id'] ) ? absint( $cart_item['variation_id'] ) : 0;

            if ( tun_saas_is_mapped_product( $cart_product_id, $cart_variation_id ) ) {
                WC()->cart->remove_cart_item( $cart_item_key );
            }
        }
    }

    return true;
}
add_filter( 'woocommerce_add_to_cart_validation', 'tun_saas_prepare_plan_add_to_cart', 5, 5 );

/**
 * A Tun SaaS checkout represents exactly one account subscription. Force the
 * newly added mapped product to quantity 1 and remove any other mapped plan.
 * This second guard covers Store API/block checkouts and sites where another
 * extension invokes add_to_cart more than once in a request.
 */
function tun_saas_normalize_plan_after_add( $cart_item_key, $product_id, $quantity, $variation_id, $variation, $cart_item_data ) {
    if ( ! tun_saas_active_checkout_token() || ! tun_saas_is_mapped_product( $product_id, $variation_id ) ) {
        return;
    }

    if ( ! function_exists( 'WC' ) || ! WC()->cart ) {
        return;
    }

    foreach ( WC()->cart->get_cart() as $other_key => $cart_item ) {
        $cart_product_id   = isset( $cart_item['product_id'] ) ? absint( $cart_item['product_id'] ) : 0;
        $cart_variation_id = isset( $cart_item['variation_id'] ) ? absint( $cart_item['variation_id'] ) : 0;

        if ( $other_key !== $cart_item_key && tun_saas_is_mapped_product( $cart_product_id, $cart_variation_id ) ) {
            WC()->cart->remove_cart_item( $other_key );
        }
    }

    if ( isset( WC()->cart->cart_contents[ $cart_item_key ] ) ) {
        WC()->cart->set_quantity( $cart_item_key, 1, false );
    }
}
add_action( 'woocommerce_add_to_cart', 'tun_saas_normalize_plan_after_add', 100, 6 );

/**
 * Also expose mapped SaaS plans as sold individually while a Tun checkout token
 * is active, so quantity controls cannot create multi-seat subscriptions.
 */
function tun_saas_sell_checkout_plan_individually( $sold_individually, $product ) {
    if ( $sold_individually || ! tun_saas_active_checkout_token() || ! is_a( $product, 'WC_Product' ) ) {
        return $sold_individually;
    }

    return tun_saas_is_mapped_product( $product->get_id(), $product->get_parent_id() );
}
add_filter( 'woocommerce_is_sold_individually', 'tun_saas_sell_checkout_plan_individually', 20, 2 );

function tun_saas_add_token_to_order( $order, $data ) {
    if ( ! function_exists( 'WC' ) || ! WC()->session || ! is_a( $order, 'WC_Order' ) ) {
        return;
    }

    $token = tun_saas_active_checkout_token();
    if ( $token ) {
        $order->update_meta_data( TUN_SAAS_CHECKOUT_META_KEY, $token );
    }
}
add_action( 'woocommerce_checkout_create_order', 'tun_saas_add_token_to_order', 20, 2 );

function tun_saas_add_token_to_store_api_order( $order ) {
    if ( ! function_exists( 'WC' ) || ! WC()->session || ! is_a( $order, 'WC_Order' ) ) {
        return;
    }

    $token = tun_saas_active_checkout_token();
    if ( $token ) {
        $order->update_meta_data( TUN_SAAS_CHECKOUT_META_KEY, $token );
        $order->save();
    }
}
add_action( 'woocommerce_store_api_checkout_order_processed', 'tun_saas_add_token_to_store_api_order', 20, 1 );

function tun_saas_copy_token_to_subscription( $subscription, $order, $recurring_cart ) {
    if ( ! is_a( $subscription, 'WC_Subscription' ) || ! is_a( $order, 'WC_Order' ) ) {
        return;
    }

    $token = tun_saas_clean_checkout_token( $order->get_meta( TUN_SAAS_CHECKOUT_META_KEY, true ) );
    if ( ! $token ) {
        $token = tun_saas_active_checkout_token();
    }

    if ( $token ) {
        $subscription->update_meta_data( TUN_SAAS_CHECKOUT_META_KEY, $token );
        $subscription->save();
    }
}
add_action( 'woocommerce_checkout_subscription_created', 'tun_saas_copy_token_to_subscription', 20, 3 );

function tun_saas_clear_checkout_token( $order_id ) {
    if ( function_exists( 'WC' ) && WC()->session ) {
        WC()->session->__unset( TUN_SAAS_CHECKOUT_META_KEY );
    }
}
add_action( 'woocommerce_thankyou', 'tun_saas_clear_checkout_token', 20, 1 );
