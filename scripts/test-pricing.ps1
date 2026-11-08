# ============================================================
# test-pricing.ps1 — Test endpoint POST /orders
# ============================================================
$ErrorActionPreference = "Stop"

$BaseUrl = "http://localhost:4000/api/v1"
$OrdersUrl = "$BaseUrl/orders"

Write-Host "`n=== TEST 1: Retail QRIS ===" -ForegroundColor Cyan

$body1 = @{
    items = @(
        @{ variant_id = 1; quantity = 2; selling_mode = "package" }
    )
    shipping_address = @{
        name = "Test User"
        phone = "081234567890"
        address = "Jl. Test No. 1"
    }
    payment_provider_id = 2
    shipping_distance_km = 10
} | ConvertTo-Json -Depth 10

try {
    $response1 = Invoke-RestMethod -Uri $OrdersUrl -Method Post -Body $body1 -ContentType "application/json"
    
    Write-Host "`n  Response:" -ForegroundColor Yellow
    Write-Host "  Order: $($response1.data.order_number)" -ForegroundColor White
    Write-Host "  Subtotal: Rp$($response1.data.subtotal)" -ForegroundColor White
    Write-Host "  Selling Price: Rp$($response1.data.selling_price)" -ForegroundColor White
    Write-Host "  Shipping: Rp$($response1.data.shipping_total)" -ForegroundColor White
    Write-Host "  Grand Total: Rp$($response1.data.grand_total)" -ForegroundColor White
    
    if ($response1.data.pricing_breakdown) {
        Write-Host "`n  Breakdown:" -ForegroundColor Yellow
        Write-Host "    Target Net: Rp$($response1.data.pricing_breakdown.target_net)" -ForegroundColor White
        Write-Host "    Commission: Rp$($response1.data.pricing_breakdown.commission)" -ForegroundColor White
        Write-Host "    Commission PPN: Rp$($response1.data.pricing_breakdown.commission_ppn)" -ForegroundColor White
        Write-Host "    Payment Fee: Rp$($response1.data.pricing_breakdown.payment_fee)" -ForegroundColor White
        Write-Host "    Payment PPN: Rp$($response1.data.pricing_breakdown.payment_ppn)" -ForegroundColor White
        Write-Host "    Tenant Net: Rp$($response1.data.pricing_breakdown.tenant_net)" -ForegroundColor Green
    }
    
    $valid = $true
    if ($response1.data.pricing_breakdown.tenant_net -lt $response1.data.subtotal) {
        Write-Host "`n  ❌ VALIDASI GAGAL: tenant_net < subtotal" -ForegroundColor Red
        $valid = $false
    }
    if (-not $response1.data.selling_price) {
        Write-Host "`n  ❌ VALIDASI GAGAL: selling_price tidak ada" -ForegroundColor Red
        $valid = $false
    }
    if ($valid) {
        Write-Host "`n  ✅ VALIDASI PASS" -ForegroundColor Green
    }
} catch {
    Write-Host "  ❌ ERROR: $_" -ForegroundColor Red
    Write-Host "  Response: $($_.Exception.Response)" -ForegroundColor Red
}

Write-Host "`n=== TEST 2: VA BCA flat ===" -ForegroundColor Cyan

$body2 = @{
    items = @(
        @{ variant_id = 1; quantity = 2; selling_mode = "package" }
    )
    shipping_address = @{
        name = "Test User"
        phone = "081234567890"
        address = "Jl. Test No. 1"
    }
    payment_provider_id = 3
    shipping_distance_km = 3
} | ConvertTo-Json -Depth 10

try {
    $response2 = Invoke-RestMethod -Uri $OrdersUrl -Method Post -Body $body2 -ContentType "application/json"
    
    Write-Host "`n  Response:" -ForegroundColor Yellow
    Write-Host "  Order: $($response2.data.order_number)" -ForegroundColor White
    Write-Host "  Subtotal: Rp$($response2.data.subtotal)" -ForegroundColor White
    Write-Host "  Selling Price: Rp$($response2.data.selling_price)" -ForegroundColor White
    Write-Host "  Shipping: Rp$($response2.data.shipping_total)" -ForegroundColor White
    Write-Host "  Grand Total: Rp$($response2.data.grand_total)" -ForegroundColor White
    
    if ($response2.data.pricing_breakdown) {
        Write-Host "`n  Breakdown:" -ForegroundColor Yellow
        Write-Host "    Tenant Net: Rp$($response2.data.pricing_breakdown.tenant_net)" -ForegroundColor Green
    }
} catch {
    Write-Host "  ❌ ERROR: $_" -ForegroundColor Red
}

Write-Host "`n=== DONE ===" -ForegroundColor Green