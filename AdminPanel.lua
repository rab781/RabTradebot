-- LocalScript di StarterPlayer -> StarterPlayerScripts
local player = game.Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local screenGui = Instance.new("ScreenGui")
screenGui.Parent = playerGui

-- Admin User IDs
local adminUserIds = {8345044742, 123456789}  -- Ganti dengan User ID admin Anda

-- Fungsi untuk memeriksa apakah pemain adalah admin
local function isAdmin(player)
	for _, adminID in ipairs(adminUserIds) do
		if player.UserId == adminID then
			return true
		end
	end
	return false
end

-- Jika pemain bukan admin, keluar
if not isAdmin(player) then
	return -- Jangan tampilkan GUI jika bukan admin
end

-- Variables
local isPanelVisible = false
local selectedPlayer = nil

-- Frame utama untuk GUI
local mainFrame = Instance.new("Frame")
mainFrame.Size = UDim2.new(0.6, 0, 0.8, 0)
mainFrame.Position = UDim2.new(0.2, 0, 0.1, 0)
mainFrame.BackgroundColor3 = Color3.fromRGB(40, 40, 40)
mainFrame.BorderSizePixel = 0
mainFrame.Visible = false
mainFrame.Parent = screenGui

-- Corner radius untuk main frame
local mainCorner = Instance.new("UICorner")
mainCorner.CornerRadius = UDim.new(0, 8)
mainCorner.Parent = mainFrame

-- Left Sidebar
local sidebar = Instance.new("Frame")
sidebar.Size = UDim2.new(0.08, 0, 1, 0)
sidebar.Position = UDim2.new(0, 0, 0, 0)
sidebar.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
sidebar.BorderSizePixel = 0
sidebar.Parent = mainFrame

local sidebarCorner = Instance.new("UICorner")
sidebarCorner.CornerRadius = UDim.new(0, 8)
sidebarCorner.Parent = sidebar

-- Sidebar icons
local iconSize = UDim2.new(0.6, 0, 0.06, 0)
local iconSpacing = 0.08

-- Logo/Home icon
local homeIcon = Instance.new("TextButton")
homeIcon.Size = iconSize
homeIcon.Position = UDim2.new(0.2, 0, 0.05, 0)
homeIcon.Text = "🏠"
homeIcon.BackgroundTransparency = 1
homeIcon.TextColor3 = Color3.fromRGB(255, 255, 255)
homeIcon.FontSize = Enum.FontSize.Size24
homeIcon.Parent = sidebar

-- Users icon (active)
local usersIcon = Instance.new("TextButton")
usersIcon.Size = iconSize
usersIcon.Position = UDim2.new(0.2, 0, 0.05 + iconSpacing, 0)
usersIcon.Text = "👥"
usersIcon.BackgroundColor3 = Color3.fromRGB(70, 70, 70)
usersIcon.TextColor3 = Color3.fromRGB(255, 255, 255)
usersIcon.FontSize = Enum.FontSize.Size24
usersIcon.Parent = sidebar

local usersCorner = Instance.new("UICorner")
usersCorner.CornerRadius = UDim.new(0, 4)
usersCorner.Parent = usersIcon

-- Other icons
local icons = {"👤", "🌐", "</>", "💬", "⚙️"}
for i, icon in ipairs(icons) do
	local iconButton = Instance.new("TextButton")
	iconButton.Size = iconSize
	iconButton.Position = UDim2.new(0.2, 0, 0.05 + (i + 1) * iconSpacing, 0)
	iconButton.Text = icon
	iconButton.BackgroundTransparency = 1
	iconButton.TextColor3 = Color3.fromRGB(255, 255, 255)
	iconButton.FontSize = Enum.FontSize.Size24
	iconButton.Parent = sidebar
end

-- Central Player Information Area
local playerInfoFrame = Instance.new("Frame")
playerInfoFrame.Size = UDim2.new(0.45, 0, 0.6, 0)
playerInfoFrame.Position = UDim2.new(0.1, 0, 0.2, 0)
playerInfoFrame.BackgroundTransparency = 1
playerInfoFrame.Parent = mainFrame

-- Player Avatar Frame
local avatarFrame = Instance.new("Frame")
avatarFrame.Size = UDim2.new(0.2, 0, 0.15, 0)
avatarFrame.Position = UDim2.new(0, 0, 0, 0)
avatarFrame.BackgroundColor3 = Color3.fromRGB(60, 60, 60)
avatarFrame.BorderSizePixel = 0
avatarFrame.Parent = playerInfoFrame

local avatarCorner = Instance.new("UICorner")
avatarCorner.CornerRadius = UDim.new(0, 8)
avatarCorner.Parent = avatarFrame

-- Player Avatar (placeholder)
local avatarLabel = Instance.new("TextLabel")
avatarLabel.Size = UDim2.new(1, 0, 1, 0)
avatarLabel.Text = "👤"
avatarLabel.BackgroundTransparency = 1
avatarLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
avatarLabel.FontSize = Enum.FontSize.Size48
avatarLabel.Parent = avatarFrame

-- Player Username
local usernameLabel = Instance.new("TextLabel")
usernameLabel.Size = UDim2.new(0.8, 0, 0.08, 0)
usernameLabel.Position = UDim2.new(0.25, 0, 0, 0)
usernameLabel.Text = "Select a player"
usernameLabel.BackgroundTransparency = 1
usernameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
usernameLabel.FontSize = Enum.FontSize.Size24
usernameLabel.Font = Enum.Font.GothamBold
usernameLabel.TextXAlignment = Enum.TextXAlignment.Left
usernameLabel.Parent = playerInfoFrame

-- Account Created
local accountLabel = Instance.new("TextLabel")
accountLabel.Size = UDim2.new(0.8, 0, 0.05, 0)
accountLabel.Position = UDim2.new(0.25, 0, 0.1, 0)
accountLabel.Text = "Account Created: --"
accountLabel.BackgroundTransparency = 1
accountLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
accountLabel.FontSize = Enum.FontSize.Size14
accountLabel.TextXAlignment = Enum.TextXAlignment.Left
accountLabel.Parent = playerInfoFrame

-- Player ID
local idLabel = Instance.new("TextLabel")
idLabel.Size = UDim2.new(0.8, 0, 0.05, 0)
idLabel.Position = UDim2.new(0.25, 0, 0.16, 0)
idLabel.Text = "ID: --"
idLabel.BackgroundTransparency = 1
idLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
idLabel.FontSize = Enum.FontSize.Size14
idLabel.TextXAlignment = Enum.TextXAlignment.Left
idLabel.Parent = playerInfoFrame

-- Online Status
local statusFrame = Instance.new("Frame")
statusFrame.Size = UDim2.new(0.8, 0, 0.04, 0)
statusFrame.Position = UDim2.new(0.25, 0, 0.22, 0)
statusFrame.BackgroundTransparency = 1
statusFrame.Parent = playerInfoFrame

local statusDot = Instance.new("Frame")
statusDot.Size = UDim2.new(0, 8, 0, 8)
statusDot.Position = UDim2.new(0, 0, 0.5, -4)
statusDot.BackgroundColor3 = Color3.fromRGB(0, 255, 0)
statusDot.BorderSizePixel = 0
statusDot.Parent = statusFrame

local statusCorner = Instance.new("UICorner")
statusCorner.CornerRadius = UDim.new(0.5, 0)
statusCorner.Parent = statusDot

local statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(1, -20, 1, 0)
statusLabel.Position = UDim2.new(0, 15, 0, 0)
statusLabel.Text = "Online"
statusLabel.BackgroundTransparency = 1
statusLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
statusLabel.FontSize = Enum.FontSize.Size14
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.Parent = statusFrame

-- Actions Section
local actionsLabel = Instance.new("TextLabel")
actionsLabel.Size = UDim2.new(0.8, 0, 0.06, 0)
actionsLabel.Position = UDim2.new(0.25, 0, 0.3, 0)
actionsLabel.Text = "Actions"
actionsLabel.BackgroundTransparency = 1
actionsLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
actionsLabel.FontSize = Enum.FontSize.Size20
actionsLabel.Font = Enum.Font.GothamBold
actionsLabel.TextXAlignment = Enum.TextXAlignment.Left
actionsLabel.Parent = playerInfoFrame

-- Actions Grid
local actionsGrid = Instance.new("Frame")
actionsGrid.Size = UDim2.new(0.8, 0, 0.4, 0)
actionsGrid.Position = UDim2.new(0.25, 0, 0.38, 0)
actionsGrid.BackgroundTransparency = 1
actionsGrid.Parent = playerInfoFrame

-- Action buttons
local actionButtons = {
	{name = "Ban", color = Color3.fromRGB(255, 0, 0)},
	{name = "Freeze", color = Color3.fromRGB(0, 100, 255)},
	{name = "Kick", color = Color3.fromRGB(255, 165, 0)},
	{name = "Message", color = Color3.fromRGB(60, 60, 60)},
	{name = "Spectate", color = Color3.fromRGB(60, 60, 60)},
	{name = "Teleport", color = Color3.fromRGB(60, 60, 60)},
	{name = "UnFreeze", color = Color3.fromRGB(0, 200, 100)},
	{name = "Kill", color = Color3.fromRGB(200, 0, 0)}
}

for i, buttonData in ipairs(actionButtons) do
	local row = math.ceil(i / 3)
	local col = ((i - 1) % 3) + 1
	
	local actionButton = Instance.new("TextButton")
	actionButton.Size = UDim2.new(0.3, -5, 0.3, -5)
	actionButton.Position = UDim2.new((col - 1) * 0.33, 0, (row - 1) * 0.33, 0)
	actionButton.Text = buttonData.name
	actionButton.BackgroundColor3 = buttonData.color
	actionButton.TextColor3 = Color3.fromRGB(255, 255, 255)
	actionButton.FontSize = Enum.FontSize.Size14
	actionButton.Font = Enum.Font.GothamBold
	actionButton.Parent = actionsGrid
	
	local buttonCorner = Instance.new("UICorner")
	buttonCorner.CornerRadius = UDim.new(0, 4)
	buttonCorner.Parent = actionButton
	
	-- Button functionality
	actionButton.MouseButton1Click:Connect(function()
		if selectedPlayer then
			if buttonData.name == "Ban" then
				game.ReplicatedStorage.AdminActions.OnBan:FireServer(selectedPlayer.UserId)
			elseif buttonData.name == "Freeze" then
				game.ReplicatedStorage.AdminActions.OnFreeze:FireServer(selectedPlayer.UserId)
			elseif buttonData.name == "Kick" then
				game.ReplicatedStorage.AdminActions.OnKick:FireServer(selectedPlayer.UserId)
			elseif buttonData.name == "UnFreeze" then
				game.ReplicatedStorage.AdminActions.OnUnFreeze:FireServer(selectedPlayer.UserId)
			elseif buttonData.name == "Kill" then
				game.ReplicatedStorage.AdminActions.OnKill:FireServer(selectedPlayer.UserId)
			elseif buttonData.name == "Message" then
				-- Add message functionality
			elseif buttonData.name == "Spectate" then
				-- Add spectate functionality
			elseif buttonData.name == "Teleport" then
				-- Add teleport functionality
			end
		end
	end)
end

-- Right Player List Area
local playerListArea = Instance.new("Frame")
playerListArea.Size = UDim2.new(0.35, 0, 0.8, 0)
playerListArea.Position = UDim2.new(0.65, 0, 0.1, 0)
playerListArea.BackgroundTransparency = 1
playerListArea.Parent = mainFrame

-- Search Bar
local searchBar = Instance.new("TextButton")
searchBar.Size = UDim2.new(1, 0, 0.08, 0)
searchBar.Position = UDim2.new(0, 0, 0, 0)
searchBar.Text = "Search User ID"
searchBar.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
searchBar.TextColor3 = Color3.fromRGB(255, 255, 255)
searchBar.FontSize = Enum.FontSize.Size16
searchBar.Parent = playerListArea

local searchCorner = Instance.new("UICorner")
searchCorner.CornerRadius = UDim.new(0, 6)
searchCorner.Parent = searchBar

-- Player List
local playerList = Instance.new("ScrollingFrame")
playerList.Size = UDim2.new(1, 0, 0.9, 0)
playerList.Position = UDim2.new(0, 0, 0.1, 0)
playerList.BackgroundColor3 = Color3.fromRGB(45, 45, 45)
playerList.CanvasSize = UDim2.new(0, 0, 0, 0)
playerList.ScrollBarThickness = 8
playerList.Parent = playerListArea

local listCorner = Instance.new("UICorner")
listCorner.CornerRadius = UDim.new(0, 6)
listCorner.Parent = playerList

-- Function to update player list
local function updatePlayerList()
	-- Clear existing buttons
	for _, child in pairs(playerList:GetChildren()) do
		if child:IsA("TextButton") then
			child:Destroy()
		end
	end
	
	local players = game.Players:GetPlayers()
	local buttonHeight = 50
	local spacing = 5
	local totalHeight = #players * (buttonHeight + spacing)
	
	playerList.CanvasSize = UDim2.new(0, 0, 0, totalHeight)
	
	for i, p in pairs(players) do
		local playerButton = Instance.new("TextButton")
		playerButton.Size = UDim2.new(1, -10, 0, buttonHeight)
		playerButton.Position = UDim2.new(0, 5, 0, (i - 1) * (buttonHeight + spacing))
		playerButton.Text = p.Name
		playerButton.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
		playerButton.TextColor3 = Color3.fromRGB(255, 255, 255)
		playerButton.FontSize = Enum.FontSize.Size16
		playerButton.Font = Enum.Font.Gotham
		playerButton.TextXAlignment = Enum.TextXAlignment.Left
		playerButton.Parent = playerList
		
		local buttonCorner = Instance.new("UICorner")
		buttonCorner.CornerRadius = UDim.new(0, 4)
		buttonCorner.Parent = playerButton
		
		-- Player selection
		playerButton.MouseButton1Click:Connect(function()
			-- Update selected player
			selectedPlayer = p
			
			-- Update UI
			usernameLabel.Text = p.Name
			accountLabel.Text = "Account Created: " .. p.AccountAge .. " days ago"
			idLabel.Text = "ID: " .. p.UserId
			
			-- Highlight selected button
			for _, child in pairs(playerList:GetChildren()) do
				if child:IsA("TextButton") then
					child.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
				end
			end
			playerButton.BackgroundColor3 = Color3.fromRGB(70, 70, 70)
		end)
		
		-- Hover effects
		playerButton.MouseEnter:Connect(function()
			if selectedPlayer ~= p then
				playerButton.BackgroundColor3 = Color3.fromRGB(60, 60, 60)
			end
		end)
		
		playerButton.MouseLeave:Connect(function()
			if selectedPlayer ~= p then
				playerButton.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
			end
		end)
	end
end

-- Update player list when players join/leave
game.Players.PlayerAdded:Connect(updatePlayerList)
game.Players.PlayerRemoving:Connect(updatePlayerList)

-- Initial player list update
updatePlayerList()

-- Toggle panel visibility with B key
local UserInputService = game:GetService("UserInputService")
UserInputService.InputBegan:Connect(function(input, gameProcessed)
	if not gameProcessed and input.KeyCode == Enum.KeyCode.B then
		isPanelVisible = not isPanelVisible
		mainFrame.Visible = isPanelVisible
	end
end)

-- Close button functionality (optional)
local closeButton = Instance.new("TextButton")
closeButton.Size = UDim2.new(0, 30, 0, 30)
closeButton.Position = UDim2.new(1, -35, 0, 5)
closeButton.Text = "X"
closeButton.BackgroundColor3 = Color3.fromRGB(255, 0, 0)
closeButton.TextColor3 = Color3.fromRGB(255, 255, 255)
closeButton.FontSize = Enum.FontSize.Size18
closeButton.Font = Enum.Font.GothamBold
closeButton.Parent = mainFrame

local closeCorner = Instance.new("UICorner")
closeCorner.CornerRadius = UDim.new(0, 4)
closeCorner.Parent = closeButton

closeButton.MouseButton1Click:Connect(function()
	isPanelVisible = false
	mainFrame.Visible = false
end)