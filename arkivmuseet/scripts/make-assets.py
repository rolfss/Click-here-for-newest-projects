"""Original, detailed museum kit. Run with Blender --background --factory-startup.
Seven prototype names, origins and dimensions form the runtime API.
Blank props are visual reconstructions, never historical source documents.
"""
import bpy, math, os
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../public/assets/museum-kit.glb'))

def material(name,color,metal=0,rough=.6):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

def surface(mat,kind,size=256):
    """Packed deterministic albedo and tangent normal maps; no external textures."""
    heights=[];colors=[]
    for y in range(size):
        for x in range(size):
            u,v=x/size*math.tau,y/size*math.tau
            grain=math.sin(u*32+math.sin(v)*2+math.sin(u*4+v)*.8)
            fleck=(math.sin(u*51+v*37)+math.cos(u*43-v*67))*.5
            if kind=='wood':
                h=grain*.35+fleck*.1;f=.88+grain*.026+fleck*.008;color=(.34*f,.235*f,.15*f)
            else:
                cloud=math.sin(u*3+math.sin(v*2))*math.cos(v*4)
                h=fleck*.3+cloud*.12;f=.96+cloud*.018+fleck*.018;color=(.80*f,.758*f,.654*f)
            heights.append(h);colors.extend((*color,1))
    albedo=bpy.data.images.new(kind+'-albedo',width=size,height=size);albedo.pixels=colors;albedo.pack()
    normal=bpy.data.images.new(kind+'-normal',width=size,height=size);normal.colorspace_settings.name='Non-Color';pixels=[]
    for y in range(size):
        for x in range(size):
            dx=heights[y*size+(x+1)%size]-heights[y*size+(x-1)%size]
            dy=heights[((y+1)%size)*size+x]-heights[((y-1)%size)*size+x]
            strength=.045 if kind=='wood' else .09
            n=Vector((-dx*strength,-dy*strength,1)).normalized();pixels.extend((n.x*.5+.5,n.y*.5+.5,n.z*.5+.5,1))
    normal.pixels=pixels;normal.pack();nodes,links=mat.node_tree.nodes,mat.node_tree.links;p=nodes.get('Principled BSDF')
    tx=nodes.new('ShaderNodeTexImage');tx.image=albedo;links.new(tx.outputs['Color'],p.inputs['Base Color'])
    tx=nodes.new('ShaderNodeTexImage');tx.image=normal;nm=nodes.new('ShaderNodeNormalMap')
    links.new(tx.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],p.inputs['Normal'])

stone=material('Honed warm limestone',(.64,.57,.43),rough=.78)
wood=material('Oiled smoked oak',(.095,.055,.028),rough=.36)
surface(stone,'stone');surface(wood,'wood')
brass=material('Satin bronze',(.44,.285,.105),.82,.28)
patina=material('Patinated bronze recesses',(.13,.094,.045),.65,.48)
paper=material('Unmarked ivory rag paper',(.82,.77,.64),rough=.91)
edge=material('Aged unmarked page edges',(.55,.43,.27),rough=.95)
dark=material('Enamelled archive steel',(.035,.072,.066),.45,.37)
shadow=material('Recess and ventilation shadow',(.011,.018,.017),.3,.63)
light=material('Equipment status light',(.08,.38,.34),.2,.25)
p=light.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(.05,.31,.23,1);p.inputs['Emission Strength'].default_value=.5

def group(name):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o)
    o['asset_note']='Original visual reconstruction; blank props are not source documents.'
    return o

def finish(o,mat,parent):
    o.data.materials.append(mat);o.parent=parent;return o

def bevel(o,width,segments=2):
    if width:
        m=o.modifiers.new('Soft manufactured edges','BEVEL');m.width=width;m.segments=segments
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
        for face in o.data.polygons:face.use_smooth=True
        m=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');m.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=m.name)

def box(name,loc,scale,mat,parent,radius=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bevel(o,radius)
    return finish(o,mat,parent)

def cylinder(name,radius,depth,z,mat,parent,vertices=48,xy=(0,0),rim=0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=(*xy,z));o=bpy.context.object;o.name=name
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    bevel(o,rim,1);return finish(o,mat,parent)

def torus(name,radius,tube,z,mat,parent,segments=48):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=tube,major_segments=segments,minor_segments=6,location=(0,0,z));o=bpy.context.object;o.name=name
    for f in o.data.polygons:f.use_smooth=True
    return finish(o,mat,parent)

def screw(x,y,z,parent,radius=.013):
    o=cylinder('Bronze screw',radius,.008,z,brass,parent,vertices=8,xy=(x,y));o.rotation_euler.x=math.pi/2
    box('Screw slot',(x,y-.005,z),(radius*1.2,.003,.003),shadow,parent)

# Entasis, twenty-four carved flutes, rounded mouldings and layered stone capital.
p=group('column');box('Chamfered square plinth',(0,0,.14),(1.3,1.3,.28),stone,p,.025)
for r,d,z in [(.645,.10,.31),(.586,.075,.395),(.528,.10,.483),(.466,.07,.565),(.439,.075,5.67),(.478,.095,5.754),(.535,.11,5.855),(.63,.105,5.977)]:
    cylinder('Turned limestone moulding',r,d,z,stone,p,vertices=32,rim=.01)
for r,t,z in [(.571,.045,.37),(.514,.023,.485),(.427,.021,5.655),(.476,.03,5.77),(.568,.034,5.916)]:torus('Rounded stone torus',r,t,z,stone,p)
verts=[];faces=[];n=144;levels=[(.60,.455),(1.4,.475),(2.5,.469),(3.8,.448),(4.9,.425),(5.625,.410)]
for z,radius in levels:
    for i in range(n):
        a=i/n*math.tau;r=radius-.036*(.5+.5*math.cos(a*24));verts.append((r*math.cos(a),r*math.sin(a),z))
for j in range(len(levels)-1):
    for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
mesh=bpy.data.meshes.new('Entasis and carved flutes');mesh.from_pydata(verts,[],faces)
o=bpy.data.objects.new('Fluted shaft',mesh);bpy.context.collection.objects.link(o)
for f in mesh.polygons:f.use_smooth=True
finish(o,stone,p);uv=mesh.uv_layers.new(name='UVMap')
for poly in mesh.polygons:
    indices=[mesh.loops[i].vertex_index for i in poly.loop_indices]
    seam=any(i%n==0 for i in indices) and any(i%n==n-1 for i in indices)
    for li,vi in zip(poly.loop_indices,indices):
        u=1 if seam and vi%n==0 else vi%n/n;uv.data[li].uv=(u*3,verts[vi][2]/2)
box('Abacus lower fillet',(0,0,6.038),(1.31,1.31,.085),stone,p,.012)
box('Abacus crown',(0,0,6.12),(1.4,1.4,.16),stone,p,.025)

# Separate bevelled voussoirs create actual recessed joints in the arch.
p=group('arch')
for i in range(17):
    a0=i/17*math.pi+.004;a1=(i+1)/17*math.pi-.004;verts=[]
    for depth in [-.28,.28]:
        for radius in [2.45,2.9]:
            for j in range(5):
                a=a0+(a1-a0)*j/4;verts.append((math.cos(a)*radius,depth,math.sin(a)*radius))
    faces=[]
    for j,k in [(0,1),(1,3),(3,2),(2,0)]:
        for s in range(4):faces.append((j*5+s,k*5+s,k*5+s+1,j*5+s+1))
    faces.extend([(0,10,15,5),(4,9,19,14)])
    mesh=bpy.data.meshes.new('Cut stone voussoir');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('Central keystone' if i==8 else 'Radiating arch stone',mesh);bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o;bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT');bevel(o,.007);finish(o,stone,p)
    for radius in [2.466,2.875]:
        a=(a0+a1)/2;o=box('Inlaid archivolt segment',(math.cos(a)*radius,-.286,math.sin(a)*radius),(radius*(a1-a0),.012,.016),patina,p)
        o.rotation_euler.y=math.pi/2-a

p=group('cabinet');box('Cabinet body',(0,0,1.1),(1.8,.68,2.2),dark,p,.018)
box('Recessed front frame',(0,-.349,1.1),(1.73,.023,2.08),shadow,p,.009)
box('Overhanging cabinet crown',(0,0,2.185),(1.81,.70,.075),dark,p,.014)
box('Cabinet foot',(0,.008,.054),(1.77,.655,.11),patina,p,.012)
for z in [.3,.82,1.34,1.86]:
    box('Rolled drawer face',(0,-.367,z),(1.67,.055,.459),dark,p,.016)
    box('Inset drawer panel',(0,-.398,z),(1.56,.017,.36),dark,p,.012)
    for x in [-.18,.18]:
        box('Handle mounting plate',(x,-.413,z+.065),(.061,.023,.10),brass,p,.008)
        box('Handle stand-off',(x,-.441,z+.071),(.029,.062,.033),brass,p,.007)
    box('Rounded drawer pull',(0,-.47,z+.071),(.386,.035,.043),brass,p,.014)
    box('Bronze label holder',(0,-.415,z-.097),(.438,.018,.148),brass,p,.006)
    box('Blank cream label',(0,-.427,z-.097),(.382,.009,.104),paper,p,.003)
    for x in [-.204,.204]:screw(x,-.43,z-.097,p,.008)

p=group('desk');box('Oiled oak table slab',(0,0,1.02),(3.1,1.35,.15),wood,p,.026)
box('Bronze desktop edge',(0,0,.970),(3.105,1.355,.022),brass,p,.008)
for y in [-.52,.52]:box('Oak apron',(0,y,.865),(2.84,.1,.20),wood,p,.009)
for x in [-1.32,1.32]:
    box('Oak apron side',(x,0,.865),(.10,1.04,.20),wood,p,.009)
    for y in [-.46,.46]:
        box('Oak taper leg',(x,y,.47),(.116,.116,.93),wood,p,.014)
        box('Bronze foot ferrule',(x,y,.064),(.124,.124,.128),brass,p,.012)
        box('Leg shoulder band',(x,y,.755),(.13,.13,.08),patina,p,.008)
for x in [-.71,.71]:
    box('Flush writing drawer',(x,-.582,.864),(1.31,.021,.143),wood,p,.008)
    box('Recessed drawer pull',(x,-.602,.864),(.16,.02,.037),brass,p,.01)

p=group('folder');box('Archival folder back',(0,0,.011),(.43,.59,.014),edge,p,.006)
box('Archival folder front',(.004,0,.043),(.425,.59,.012),paper,p,.006)
box('Folded folder spine',(-.211,0,.026),(.014,.59,.045),edge,p,.004)
for i in range(6):
    o=box('Unmarked separated paper leaf',(.005+math.sin(i*3)*.0015,-.003,.019+i*.003),(.402,.555,.002),paper,p,.0007)
    o.rotation_euler.z=math.sin(i*4)*.003
box('Blank indexing tab',(.115,.299,.038),(.12,.025,.012),edge,p,.003)
for x in [-.183,-.173]:box('Folder crease',(x,0,.0492),(.001,.56,.0008),edge,p)

p=group('server');box('Rack enclosure',(0,0,1.4),(1.25,.8,2.8),dark,p,.022)
box('Recessed equipment bay',(0,-.406,1.4),(1.115,.028,2.65),shadow,p,.005)
for x in [-.587,.587]:box('Rack mounting rail',(x,-.432,1.4),(.062,.04,2.66),patina,p,.006)
for i in range(12):
    z=.19+i*.22;box('Brushed equipment face',(0,-.439,z),(1.085,.063,.176),dark,p,.006)
    box('Vent recess',(-.15,-.473,z),(.63,.012,.103),shadow,p,.004)
    for j in range(10):box('Ventilation fin',(-.431+j*.062,-.482,z),(.008,.018,.096),dark,p)
    for x in [-.515,.515]:screw(x,-.481,z,p,.009)
    box('Blank service label',(.325,-.474,z+.025),(.17,.008,.055),paper,p,.002)
    box('Status indicator',(.45,-.481,z-.035),(.027,.012,.017),light,p,.003)
    for x in [.247,.308]:box('Data port',(x,-.479,z-.041),(.037,.014,.025),shadow,p,.002)
box('Bronze rack crown',(0,0,2.82),(1.3,.86,.05),brass,p,.012)
for x in [-.47,.47]:
    for y in [-.27,.27]:cylinder('Rack levelling foot',.08,.07,.01,shadow,p,vertices=16,xy=(x,y),rim=.008)

# A sculptural helix of blank leaves. This object is explicitly not an archive source.
p=group('memory')
for i in range(17):
    a=i*.17;pos=(math.sin(a)*.8,math.cos(a)*.35,.25+i*.16)
    o=box('Bronze bound leaf' if i in [0,8,16] else 'Sculptural blank paper leaf',pos,(1.45,.93,.045),brass if i in [0,8,16] else paper,p,.014)
    o.rotation_euler=(.04*i,.06*i,a)
    if i not in [0,8,16]:
        line=box('Paper edge lamination',(0,0,0),(1.41,.006,.003),edge,p,.001)
        line.rotation_euler=o.rotation_euler;line.location=Vector(pos)+o.rotation_euler.to_matrix()@Vector((0,-.461,0))

def merge_material_parts(parent):
    """One primitive per material and prototype keeps runtime instancing inexpensive."""
    buckets={}
    for child in list(parent.children):
        if child.type=='MESH':buckets.setdefault(child.data.materials[0].name,[]).append(child)
    for mat_name,objects in buckets.items():
        bpy.ops.object.select_all(action='DESELECT')
        for child in objects:child.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        objects[0].name=parent.name+' - '+mat_name
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)

prototypes=[o for o in bpy.context.scene.objects if o.type=='EMPTY']
for prototype in prototypes:merge_material_parts(prototype)
assert sorted(p.name for p in prototypes)==['arch','cabinet','column','desk','folder','memory','server']
os.makedirs(os.path.dirname(OUT),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT,export_format='GLB',export_yup=True,export_apply=True,export_extras=True,export_image_format='AUTO')
size=os.path.getsize(OUT);print('Museum kit:',OUT,size,'bytes; seven stable prototypes')
assert size<3*1024*1024,'Museum kit exceeded the 3 MiB web asset budget'
