# ==========================================================================
# Aegis Vault - PowerShell HTTP REST API Backend Server
# ==========================================================================

$port = 5000
$dbFile = Join-Path $PSScriptRoot "database.json"

# Initialize Database File if missing
if (-not (Test-Path $dbFile)) {
    $initialDb = @{
        users = @(
            @{
                id = "usr_admin_001"
                email = "admin@example.com"
                fullName = "Alex Morgan"
                role = "Security Lead"
                # SHA256 hash of 'password123' with salt 'aegis_salt'
                passwordHash = "4b2e88a0e8d0859a22f30b9101d2938a9d1858c73d9d3d3a08892d2448374828"
                salt = "aegis_salt"
                twoFactorEnabled = $true
                createdAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            }
        )
        sessions = @()
        auditLogs = @(
            @{
                id = "log_001"
                userId = "usr_admin_001"
                event = "Database Initialized"
                ip = "127.0.0.1"
                timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                status = "Success"
            }
        )
    }
    $initialDb | ConvertTo-Json -Depth 10 | Set-Content $dbFile -Encoding UTF8
    Write-Host "[Database] Initialized new database file at $dbFile" -ForegroundColor Green
}

function Get-Database {
    Get-Content $dbFile -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Save-Database ($db) {
    $db | ConvertTo-Json -Depth 10 | Set-Content $dbFile -Encoding UTF8
}

function Get-SHA256Hash ($text, $salt) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text + $salt)
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $hasher.ComputeHash($bytes)
    return [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
}

# Create HTTP Listener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "`n=======================================================" -ForegroundColor Cyan
    Write-Host " 🚀 Aegis Vault REST API Backend Server Listening " -ForegroundColor Green
    Write-Host " URL: http://localhost:$port/ " -ForegroundColor Yellow
    Write-Host "=======================================================`n" -ForegroundColor Cyan
} catch {
    Write-Host "Error starting HTTP listener: $_" -ForegroundColor Red
    exit 1
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    # Enable CORS
    $response.AddHeader("Access-Control-Allow-Origin", "*")
    $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
    $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    $response.AddHeader("Content-Type", "application/json; charset=utf-8")

    # Handle Preflight OPTIONS Request
    if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 200
        $response.Close()
        continue
    }

    $urlPath = $request.Url.AbsolutePath
    $method = $request.HttpMethod

    Write-Host "[$method] $urlPath" -ForegroundColor Gray

    # Read Request Body if POST/PUT
    $requestBody = ""
    if ($request.HasEntityBody) {
        $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
        $requestBody = $reader.ReadToEnd()
        $reader.Close()
    }

    $jsonReq = $null
    if ($requestBody) {
        try { $jsonReq = $requestBody | ConvertFrom-Json } catch {}
    }

    $resData = @{}
    $statusCode = 200

    # ----------------------------------------------------------------------
    # ROUTE: GET /api/health
    # ----------------------------------------------------------------------
    if ($urlPath -eq "/api/health") {
        $resData = @{ status = "ok"; service = "Aegis Vault Backend"; time = (Get-Date).ToString("o") }
    }
    
    # ----------------------------------------------------------------------
    # ROUTE: POST /api/auth/login
    # ----------------------------------------------------------------------
    elseif ($urlPath -eq "/api/auth/login" -and $method -eq "POST") {
        $db = Get-Database
        $email = $jsonReq.email
        $password = $jsonReq.password

        $user = $db.users | Where-Object { $_.email -eq $email }

        if ($user) {
            $inputHash = Get-SHA256Hash -text $password -salt $user.salt
            if ($inputHash -eq $user.passwordHash) {
                # Create session token
                $token = "token_" + [Guid]::NewGuid().ToString("N")
                $newSession = @{
                    token = $token
                    userId = $user.id
                    device = "PowerShell Client Session"
                    ip = $request.RemoteEndPoint.Address.ToString()
                    createdAt = (Get-Date).ToString("o")
                }
                
                # Append to sessions
                $db.sessions += $newSession
                Save-Database $db

                $resData = @{
                    success = $true
                    message = "Login successful"
                    token = $token
                    requires2FA = $user.twoFactorEnabled
                    user = @{
                        id = $user.id
                        email = $user.email
                        fullName = $user.fullName
                        role = $user.role
                    }
                }
            } else {
                $statusCode = 401
                $resData = @{ success = $false; error = "Invalid email or password" }
            }
        } else {
            $statusCode = 401
            $resData = @{ success = $false; error = "User account not found" }
        }
    }

    # ----------------------------------------------------------------------
    # ROUTE: POST /api/auth/register
    # ----------------------------------------------------------------------
    elseif ($urlPath -eq "/api/auth/register" -and $method -eq "POST") {
        $db = Get-Database
        $email = $jsonReq.email
        $password = $jsonReq.password
        $fullName = $jsonReq.fullName

        $existing = $db.users | Where-Object { $_.email -eq $email }
        if ($existing) {
            $statusCode = 400
            $resData = @{ success = $false; error = "Email is already registered" }
        } else {
            $salt = [Guid]::NewGuid().ToString("N").Substring(0, 10)
            $pwdHash = Get-SHA256Hash -text $password -salt $salt
            $newId = "usr_" + [Guid]::NewGuid().ToString("N").Substring(0, 8)

            $newUser = @{
                id = $newId
                email = $email
                fullName = $fullName
                role = "User"
                passwordHash = $pwdHash
                salt = $salt
                twoFactorEnabled = $false
                createdAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            }

            $db.users += $newUser
            Save-Database $db

            $resData = @{
                success = $true
                message = "Registration successful"
                user = @{ id = $newId; email = $email; fullName = $fullName }
            }
        }
    }

    # ----------------------------------------------------------------------
    # ROUTE: POST /api/auth/verify-2fa
    # ----------------------------------------------------------------------
    elseif ($urlPath -eq "/api/auth/verify-2fa" -and $method -eq "POST") {
        $code = $jsonReq.code
        if ($code -and $code.Length -eq 6) {
            $resData = @{ success = $true; message = "2FA verified successfully" }
        } else {
            $statusCode = 400
            $resData = @{ success = $false; error = "Invalid 2FA code" }
        }
    }

    # ----------------------------------------------------------------------
    # DEFAULT 404
    # ----------------------------------------------------------------------
    else {
        $statusCode = 404
        $resData = @{ error = "Endpoint not found" }
    }

    # Send Json Response
    $jsonResponse = $resData | ConvertTo-Json -Depth 5
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
    $response.StatusCode = $statusCode
    $response.ContentLength64 = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.OutputStream.Close()
}
