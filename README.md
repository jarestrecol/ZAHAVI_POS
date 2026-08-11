# Zahavi · Recetario

Recetario de panadería y pastelería. Se consulta desde el navegador en la
panadería y en la casa de producción, funciona sin conexión y no necesita
servidor, base de datos ni cuentas de usuario.

**Fase 1**: consultar, crear y modificar recetas con sus componentes y métodos.
Producción, costos y cálculos quedan para fases siguientes.

## Cómo funciona el dato

Esto es un sitio estático: no hay servidor que guarde nada. El modelo es
deliberadamente simple y conviene entenderlo antes de usarlo.

```
data/recipes.json  ─────►  lo que ven TODAS las sedes
   (versión publicada)     cambia solo al publicar el sitio

navegador de cada equipo ►  cambios locales
   (cambios sin publicar)   los ve solo ese equipo
```

Cuando alguien crea o edita una receta, el cambio se guarda **en ese equipo**.
Aparece un aviso permanente en la cabecera: *"N cambios sin publicar en este
equipo"*. Para que el resto de las sedes los vean hay que publicarlos.

### Publicar cambios

1. **Ajustes → Descargar recetas actualizadas**. Obtienes un `recipes.json`.
2. Reemplaza `data/recipes.json` del proyecto por ese archivo.
3. `git commit` y `git push`. Vercel republica solo.
4. En cada equipo, al recargar, el aviso desaparece: ya están publicados.

Si prefieres no tocar los cambios de un equipo, **Ajustes → Descartar cambios de
este equipo** lo devuelve a la versión publicada.

### Si se publica una versión nueva y un equipo tenía cambios

La aplicación lo detecta y avisa del conflicto en Ajustes. Hay que decidir: o se
descartan los cambios de ese equipo, o se publican sustituyendo la versión nueva.
No se mezclan solos, a propósito.

## Sin conexión

El recetario guarda una copia en cada equipo y registra un *service worker*, así
que abre al instante y sigue funcionando aunque se caiga la señal. Es habitual en
una cocina, y quedarse sin las recetas a media producción no es aceptable.

Al recuperar la conexión recoge sola la versión publicada más reciente.

## Uso

Entrar con la contraseña inicial `zahavi2026` y tocar la portada.

Buscar por nombre, código o ingrediente. Filtrar por categoría. Crear, editar y
eliminar recetas. Imprimir la ficha de una receta o el índice completo en A4.

La búsqueda, el filtro y la receta abierta van en la dirección, así que se puede
enviar por WhatsApp un enlace directo a una receta concreta.

### Sobre la contraseña

**Es una cortina, no una cerradura.** Se comprueba dentro del navegador. Sirve
para que un cliente que se asome al mostrador no vea las fórmulas; no protege
frente a alguien que sepa lo que hace. Cualquiera con el enlace puede descargar
`data/recipes.json` directamente.

Si en algún momento hace falta protección real, la vía es Deployment Protection
de Vercel (contraseña a nivel de plataforma, delante del sitio entero).

## Despliegue

### Vercel

Sitio estático sin compilación. Al importar el repositorio:

- **Framework Preset**: `Other`
- **Build Command**: vacío
- **Output Directory**: vacío (raíz)

`vercel.json` ya define las cabeceras: política de seguridad de contenido,
`X-Frame-Options`, `nosniff`, `noindex` y las reglas de caché (las recetas y el
service worker sin caché, para que una publicación se vea enseguida).

### Dominio en Namecheap

En Vercel, **Settings → Domains**, añade el dominio. Vercel indica qué registros
crear. En Namecheap, **Domain List → Manage → Advanced DNS**:

| Tipo | Host | Valor |
|---|---|---|
| `A` | `@` | la IP que indique Vercel |
| `CNAME` | `www` | el destino que indique Vercel |

Usa siempre los valores que muestre Vercel en ese momento, no los de ninguna
guía. Si Namecheap trae registros de aparcamiento por defecto, bórralos. La
propagación tarda de minutos a unas horas; el certificado HTTPS lo emite Vercel
solo.

## Desarrollo

Los módulos ES necesitan servirse por HTTP; abrir `index.html` con doble clic no
funciona.

```
python -m http.server 8000
```

Pruebas de la capa de datos (publicado, cambios locales, conflictos, sin red):

```
node scripts/test-datos.mjs
```

Versión de un solo archivo, para llevar en memoria USB y abrir con doble clic:

```
node scripts/build-standalone.mjs
```

## Estructura

```
index.html              Punto de entrada
vercel.json             Cabeceras y caché
sw.js                   Service worker (funcionamiento sin conexión)
assets/css/             tokens · base · book · views · dialogs · print
data/recipes.json       Recetas publicadas: la fuente de verdad
src/lib/                dom (DOM sin innerHTML) · format · a11y
src/core/               storage · schema · repository · auth · store · router · search
src/views/              login · header · book · index-view · detail
                        editor · settings · confirm · window · print
src/main.js             Arranque y orquestación
scripts/                Pruebas y generador de la versión de un solo archivo
```

Sin dependencias, sin compilación, sin `node_modules`. JavaScript con módulos ES
que el navegador ejecuta tal cual. Ninguna petición externa: sin CDN, sin
tipografías remotas, sin analítica.

## Datos

```json
{
  "version": 2,
  "revision": "2026-08-11",
  "recipes": [
    {
      "id": "R001",
      "nombre": "TORTA DE BANANO X 2 UND",
      "categoria": "PASTELERÍA",
      "metodo": "1. ...\n2. ...",
      "componentes": [
        {
          "nombre": "MASA",
          "items": [{ "ingrediente": "HARINA DE TRIGO", "cantidad": "500", "unidad": "GR" }]
        }
      ]
    }
  ],
  "ingredientes": [{ "id": "I001", "nombre": "HARINA DE TRIGO", "unidad": "GR" }]
}
```

`revision` identifica la versión publicada y es lo que permite detectar
conflictos. El sufijo `X 2 UND` del nombre se muestra aparte como rendimiento.
El catálogo de `ingredientes` alimenta el autocompletado del editor y propone la
unidad habitual.

## Accesibilidad

Contrastes verificados contra WCAG 2.2 AA. Navegación completa por teclado, con
foco visible, foco atrapado en los diálogos y `Escape` para cerrarlos. Mínimo de
12 px de letra y objetivos táctiles de 24 px. Las animaciones del libro se
desactivan cuando el sistema pide menos movimiento.

## Limitaciones conocidas

- Los cambios no se sincronizan solos entre sedes. Es el precio de no tener base
  de datos, y por eso el aviso de cambios sin publicar es permanente.
- El contenido es público para quien tenga el enlace.
- El almacenamiento del navegador ronda los 5 MB: de sobra para texto, no para
  imágenes.
- Borrar los datos de navegación de un equipo borra sus cambios sin publicar. Los
  ya publicados se recuperan solos al recargar.

## Licencia

MIT para el código. Las recetas son de quien las escribe.
