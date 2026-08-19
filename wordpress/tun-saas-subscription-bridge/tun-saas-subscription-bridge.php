<?php
/**
 * Plugin Name: Tun SaaS Subscription Bridge
 * Description: Carries Tun's short-lived checkout token onto WooCommerce orders and subscriptions so the SaaS account can be linked securely by the signed subscription webhook.
 * Version: 1.0.0
 * Author: Tun
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

const TUN_SAAS_CHECKOUT_QUERY_KEY = 'tun_checkout';
const TUN_SAAS_CHECKOUT_META_KEY  = '_tun_checkout_token';

function tun_saas_clean_checkout_token( $value ) {
    $value = is_string( $value ) ? strtolower( trim( wp_unslash( $value ) ) ) : '';
    return preg_match( '/^[a-f0-9]{64}$/', $value ) ? $value : '';
}

function tun_saas_capture_checkout_token() {
    if ( ! function_exists( 'WC' ) || ! WC()->session ) {
        return;
    }

    if ( isset( $_GET[ TUN_SAAS_CHECKOUT_QUERY_KEY ] ) ) {
        $token = tun_saas_clean_checkout_token( $_GET[ TUN_SAAS_CHECKOUT_QUERY_KEY ] );
        if ( $token ) {
            WC()->session->set( TUN_SAAS_CHECKOUT_META_KEY, $token );
        }
    }
}
add_action( 'wp_loaded', 'tun_saas_capture_checkout_token', 20 );

function tun_saas_add_token_to_order( $order, $data ) {
    if ( ! function_exists( 'WC' ) || ! WC()->session || ! is_a( $order, 'WC_Order' ) ) {
        return;
    }

    $token = tun_saas_clean_checkout_token( WC()->session->get( TUN_SAAS_CHECKOUT_META_KEY ) );
    if ( $token ) {
        $order->update_meta_data( TUN_SAAS_CHECKOUT_META_KEY, $token );
    }
}
add_action( 'woocommerce_checkout_create_order', 'tun_saas_add_token_to_order', 20, 2 );

function tun_saas_add_token_to_store_api_order( $order ) {
    if ( ! function_exists( 'WC' ) || ! WC()->session || ! is_a( $order, 'WC_Order' ) ) {
        return;
    }

    $token = tun_saas_clean_checkout_token( WC()->session->get( TUN_SAAS_CHECKOUT_META_KEY ) );
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
    if ( ! $token && function_exists( 'WC' ) && WC()->session ) {
        $token = tun_saas_clean_checkout_token( WC()->session->get( TUN_SAAS_CHECKOUT_META_KEY ) );
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
