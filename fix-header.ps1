$lines = Get-Content 'c:\FACILOAD\apps\web\src\pages\Schedule\SchedulePage.tsx'

# Find and fix the title div - insert </div> after the <p> and before view mode code
# Then remove the extra </div> later

$content = $lines | Out-String

# Fix 1: Add </div> after the title </p> to close the title div properly
$content = $content -replace '(panel onto the grid .+?Tab \+ Space works too\.)\n          </p>\n        {/\* View mode', '$1`n          </p>`n        </div>`n        {/* View mode'

# Fix 2: Remove the extra </div> that was between the title row close and section close
# The pattern is: ...</div>\n      </div>\n\n      {termStatus
$content = $content -replace '(All\) : null}\n        </div>\n      </div>\n\n      \{termStatus', 'All) : null}\n      </div>\n\n      {termStatus'

$content | Set-Content 'c:\FACILOAD\apps\web\src\pages\Schedule\SchedulePage.tsx'
