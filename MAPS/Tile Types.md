Tile Types:

track  
crumble  
bounce  
sweeper  
gate  
conveyor\_NESW  
ice  
RAMP\_NESW  
elev  
PLAT\_\#\_START/END   
PLAT\_\#\_POINT\_\# \- 1.5 second pause at each START/END, .5 second pause at each POINT\_  
funnel  
tunnel\_1\_ent  
tunnel\_1\_ext  
tunnel\_void

Rules:

crumble \- fast crumble rules apply for every level beyond 0\.

gate\# \- Marked on each tile it spans. Defaults apply (sits at the same z level as the surrounding tiles and is \+2 in height)

sweeper \- default rules in each location it is marked on the map.

Platforms \- Starting and ending points marked for ping-pong types.  1.5 second pause at each “START” and “END”.  .5 second pause at each “POINT”

elev\# \- Elevator style platforms marked at their location on the map with lowest z to highest z.  1 second pause at lowest and highest.

funnel \- functions as normal, drains into the tunnel in its center.

tunnel\_\#\_ent | tunnel\_\#\_ext | tunnel\_void \- Tunnel begins at tunnel\_\#\_ent and exits at tunnel\_\#\_ext.  tunnel\_void just drops downward off the map, minimal travel time to allow respawn back at closest track tile.  
